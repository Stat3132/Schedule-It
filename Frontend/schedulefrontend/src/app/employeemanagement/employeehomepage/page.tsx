"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import NextImage from "next/image";
import Cropper, { type Area, type MediaSize } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { type Announcement, type DayOfWeek, type AvailabilityStatus } from "../../../lib/supabase";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AttachmentPreview } from "../../../components/messages/AttachmentPreview";
import {
  normalizeAnnouncementRow,
  markAnnouncementsAsRead,
  type AnnouncementRow,
  createAnnouncement,
} from "../../../lib/announcements";
import { Clock, AlertCircle, Loader2 } from "lucide-react";
import { useI18n } from "../../../lib/i18n";
import {
  CROPPED_FILE_EXT,
  CROPPED_MIME_TYPE,
  CROPPED_OUTPUT_SIZE,
  MAX_PROFILE_PHOTO_BYTES,
  PRESET_AVATARS,
  PROFILE_PHOTO_BUCKET,
  getCroppedBlob,
  getFileExtension,
  isGifFile,
  isGifUrl,
} from "../../../lib/profileMedia";


type WeeklyPattern = Record<DayOfWeek, AvailabilityStatus>;
const DAY_KEYS: DayOfWeek[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

// Minimal UI/domain types used by this page
type BucketShift = {
  shiftId?: string;
  assignmentId?: string | null;
  role: string;
  start: string;
  end: string;
  color?: string | null;
  locationName?: string | null;
  isDropPending?: boolean;
  isPickedUp?: boolean;
};

type DayBucket = {
  dayIndex: number;
  date: Date;
  shifts: BucketShift[];
};

type DayFlags = {
  hasTimeOff?: boolean;
  isUnavailableByAvailability?: boolean;
  timeOffStatus?: string | null;
};

type DroppedShift = {
  assignmentId: string;
  shiftId: string;
  date: Date;
  weekdayIndex: number;
  role: string;
  locationName?: string | null;
  start: string;
  end: string;
  status?: string;
};

type SelectedShift = {
  shiftId: string;
  assignmentId?: string | null;
  date: Date;
  weekdayIndex: number;
  role: string;
  locationName?: string | null;
  start: string;
  end: string;
};

// Lightweight row types for DB query results used in this page
type AvailabilityRowLite = {
  weekly_pattern_json: unknown;
  effective_from: string;
  effective_to: string | null;
  status: string;
};

type TORowLite = {
  start_ts: string;
  end_ts: string;
  status: string;
};

// DB row types used by this page (minimal shape)
type ShiftAssignmentRow = {
  id: string;
  shift_id: string;
  user_id: string;
  assigned_by?: string | null;
  assigned_at?: string | null;
  status?: string | null;
  source?: string | null;
  drop_reason?: string | null;
  responded_at?: string | null;
};

type ShiftRow = {
  id: string;
  business_id: string;
  location_id: string | null;
  role_id: string | null;
  start_ts: string;
  end_ts: string;
  status?: string | null;
};

type RoleRow = { id: string; name: string; color?: string | null };

type LocationRow = { id: string; name: string };

type ShiftTemplateRow = {
  id: string;
  business_id: string;
  role_id: string | null;
  location_id: string | null;
  weekday: number;
  start_time: string;
  end_time: string;
};

type ShiftWithMeta = { shift: ShiftRow; role: RoleRow | null; location: LocationRow | null };

type ProfileRow = { id: string; full_name?: string | null; display_name?: string | null; email?: string | null; photo_url?: string | null; profile_title?: string | null };

// Small date/time helpers used by the page
function startOfWeek(d: Date, weekStartsOn: 0 | 1 = 0) {
  const day = d.getDay();
  const diff = (day < weekStartsOn ? 7 : 0) + day - weekStartsOn;
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(d.getDate() - diff);
  return out;
}

function endOfWeek(d: Date, weekStartsOn: 0 | 1 = 0) {
  const s = startOfWeek(d, weekStartsOn);
  const out = new Date(s);
  out.setDate(s.getDate() + 7);
  out.setMilliseconds(-1);
  return out;
}

function fmtTimeLocal(iso: string, locale?: string) {
  try {
    const dt = new Date(iso);
    return dt.toLocaleTimeString(locale ?? undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtDateMMDD(d: Date, locale?: string) {
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  return `${mm}/${dd}`;
}

function normalizeToLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// ---- Types ----
type Employment = {
  id: string;
  user_id: string;
  business_id: string;
  location_id: string | null;
  role_id: string | null;
};

function normalizePattern(raw: unknown): WeeklyPattern {
  let src: Record<string, unknown> = {};
  if (raw && typeof raw === "object" && raw !== null) {
    const r = raw as Record<string, unknown>;
    if (r.pattern && typeof r.pattern === "object" && r.pattern !== null) {
      src = r.pattern as Record<string, unknown>;
    } else {
      src = r;
    }
  }

  const out: Partial<WeeklyPattern> = {};
  for (const day of DAY_KEYS) {
    const v = src[day];
    if (v === "available" || v === "partial" || v === "unavailable") {
      out[day] = v as AvailabilityStatus;
    } else {
      out[day] = "available";
    }
  }
  return out as WeeklyPattern;
}

export default function EmployeeHome() {
  const supabase = createClientComponentClient<SupabaseClient>();
  const { t, locale } = useI18n();
  const router = useRouter();

  const shiftFallbackLabel = t("employee.home.labels.shiftFallback");
  const weekPrefix = t("employee.home.week.prefix");
  const typicalShiftLabel = t("employee.home.labels.typicalShift");
  const typicalWeekSuffix = t("employee.home.week.typicalSuffix");

  const [announcementToShow, setAnnouncementToShow] = useState<{
    announcement: Announcement;
    senderName: string;
  } | null>(null);
  const [queuedAnnouncementId, setQueuedAnnouncementId] = useState<string | null>(null);
  const [announcementDeleteLoading, setAnnouncementDeleteLoading] =
    useState(false);
  const [awaitingAuthorization, setAwaitingAuthorization] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [profileDescription, setProfileDescription] = useState("");
  const [profileNeedsSetup, setProfileNeedsSetup] = useState(false);
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [selectedPresetAvatarId, setSelectedPresetAvatarId] =
    useState<string | null>(null);
  const [profilePhotoUploading, setProfilePhotoUploading] = useState(false);
  const profileUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [profileCropModalOpen, setProfileCropModalOpen] = useState(false);
  const [profileCropImageSrc, setProfileCropImageSrc] = useState<string | null>(null);
  const [profileCrop, setProfileCrop] = useState({ x: 0, y: 0 });
  const [profileCropZoom, setProfileCropZoom] = useState(1);
  const [profileCroppedAreaPixels, setProfileCroppedAreaPixels] =
    useState<Area | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [businessOwnerId, setBusinessOwnerId] = useState<string | null>(null);

  // Basic UI & domain state (minimally typed to restore component state shape)
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [days, setDays] = useState<DayBucket[]>(() => defaultEmptyWeek());
  const [weekLabel, setWeekLabel] = useState<string>("");
  const [hadRealAssignments, setHadRealAssignments] = useState<boolean>(false);
  const [dayFlags, setDayFlags] = useState<Record<number, DayFlags>>({});
  const [droppedShifts, setDroppedShifts] = useState<DroppedShift[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [employmentState, setEmploymentState] = useState<Employment | null>(null);
  const [pendingAnnouncement, setPendingAnnouncement] = useState<{
    announcement: Announcement;
    senderName: string;
  } | null>(null);
  const [coworkers, setCoworkers] = useState<{ id: string; name: string }[]>([]);
  const [coworkersLoading, setCoworkersLoading] = useState<boolean>(false);
  const [selectedShift, setSelectedShift] = useState<SelectedShift | null>(null);
  const [dropReason, setDropReason] = useState<string>("");
  const [dropError, setDropError] = useState<string | null>(null);
  const [dropSubmitting, setDropSubmitting] = useState<boolean>(false);

  // ---- Derived summary metrics ----
  const totalShiftsThisWeek = useMemo(
    () => days.reduce((sum, bucket) => sum + bucket.shifts.length, 0),
    [days],
  );

  const daysWithoutScheduledShifts = useMemo(() => {
    const daysWithAssignments = days.filter((bucket) => bucket.shifts.length > 0).length;
    return Math.max(0, 7 - daysWithAssignments);
  }, [days]);

  const daysWithTimeOff = useMemo(
    () =>
      Object.values(dayFlags).filter(
        (f) => f && f.hasTimeOff,
      ).length,
    [dayFlags],
  );

  const hasAnyContentThisWeek =
    totalShiftsThisWeek > 0 ||
    droppedShifts.length > 0 ||
    daysWithTimeOff > 0;

  const todayDate = normalizeToLocalDay(new Date());


  const handleLogout = async () => {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      localStorage.removeItem("activeBusinessId");
      localStorage.removeItem("activeLocationIds");
    }
    router.replace("/");
  };

  const maybeShowAnnouncementForUser = useCallback(
    async (
      userId: string,
      roleId: string | null,
      userEmail: string | null,
      ownerUserId: string | null,
    ) => {
      const userEmailLower = userEmail?.toLowerCase() ?? null;

      const { data, error } = await supabase
        .from("announcements")
        .select(
          "id,title,content,created_at,created_by,target_role_ids,target_recipient_emails,target_recipient_display_names,attachment_url,attachment_name,attachment_mime,attachment_size,attachment_path",
        )
        .order("created_at", { ascending: false });

      if (error || !data) {
        if (error)
          console.error("[EmployeeHome] load announcements error", error);
        return;
      }

      const all = (data as AnnouncementRow[]).map(normalizeAnnouncementRow);

      const applicable = all.filter((a) => {
        if (a.created_by === userId) return false;
        const hasRoleTargets = a.target_role_ids.length > 0;
        const hasRecipientTargets = a.target_recipients.length > 0;
        const matchesRole =
          hasRoleTargets && roleId ? a.target_role_ids.includes(roleId) : false;
        const matchesRecipient =
          hasRecipientTargets && userEmailLower
            ? a.target_recipients.some(
              (recipient) =>
                recipient.email &&
                recipient.email.toLowerCase() === userEmailLower,
            )
            : false;

        if (!hasRoleTargets && !hasRecipientTargets) return false;
        if (matchesRole) return true;
        if (matchesRecipient) return true;
        return false;
      });

      if (applicable.length === 0) return;

      const applicableIds = applicable.map((a) => a.id);
      let readIds = new Set<string>();
      if (applicableIds.length) {
        const { data: receipts, error: receiptErr } = await supabase
          .from("announcement_receipt")
          .select("announcement_id")
          .eq("user_id", userId)
          .in("announcement_id", applicableIds);
        if (receiptErr) {
          console.error(
            "[EmployeeHome] load announcement receipts error",
            receiptErr,
          );
        } else {
          readIds = new Set(
            (receipts ?? []).map((r) => r.announcement_id as string),
          );
        }
      }

      const unseenAnnouncements = applicable.filter((a) => !readIds.has(a.id));
      if (unseenAnnouncements.length === 0) return;

      let latest = unseenAnnouncements[0];
      if (ownerUserId) {
        const ownerAnnouncements = unseenAnnouncements.filter(
          (a) => a.created_by === ownerUserId,
        );
        if (ownerAnnouncements.length > 0) {
          latest = ownerAnnouncements[0];
        }
      }

      if (!latest) return;

      if (
        queuedAnnouncementId === latest.id ||
        announcementToShow?.announcement.id === latest.id ||
        pendingAnnouncement?.announcement.id === latest.id
      ) {
        return;
      }

      const remaining = unseenAnnouncements
        .filter((a) => a.id !== latest.id)
        .map((a) => a.id);
      if (remaining.length) {
        try {
          await markAnnouncementsAsRead(supabase, userId, remaining);
        } catch (markErr) {
          console.error("[EmployeeHome] mark older announcements error", markErr);
        }
      }

      const { data: sender, error: senderErr } = await supabase
        .from("profiles")
        .select("full_name,display_name,email")
        .eq("id", latest.created_by)
        .maybeSingle();

      if (senderErr) {
        console.error("[EmployeeHome] load announcement sender error", senderErr);
      }

      const senderName =
        (sender?.full_name as string | null) ||
        (sender?.display_name as string | null) ||
        (sender?.email as string | null) ||
        t("shared.messages.managerFallback");

      setPendingAnnouncement({ announcement: latest, senderName });
      setQueuedAnnouncementId(latest.id);
    },
    [announcementToShow, pendingAnnouncement, queuedAnnouncementId, supabase, t],
  );

  const handleDismissAnnouncement = async () => {
    if (announcementToShow && currentUserId) {
      try {
        await markAnnouncementsAsRead(supabase, currentUserId, [
          announcementToShow.announcement.id,
        ]);
      } catch (err) {
        console.error("[EmployeeHome] mark announcement read error", err);
      }
    }
    setAnnouncementToShow(null);
    setQueuedAnnouncementId(null);
    setPendingAnnouncement(null);
  };

  const handleDeleteAnnouncement = async (announcementId: string) => {
    setAnnouncementDeleteLoading(true);
    try {
      const { error } = await supabase
        .from("announcements")
        .delete()
        .eq("id", announcementId);
      if (error) {
        console.error("[EmployeeHome] delete announcement error", error);
      }
    } finally {
      setAnnouncementDeleteLoading(false);
      setAnnouncementToShow(null);
      setQueuedAnnouncementId(null);
      setPendingAnnouncement(null);
    }
  };

  const announcementTimestampLabel = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));

  const handleSelectPresetAvatar = (avatarId: string, avatarUrl: string) => {
    setSelectedPresetAvatarId(avatarId);
    setProfilePhotoUrl(avatarUrl);
    setProfileError(null);
  };

  const handleResetPhotoSelection = () => {
    setSelectedPresetAvatarId(null);
    setProfilePhotoUrl(null);
    setProfileError(null);
  };

  const uploadProfilePhotoBlob = useCallback(
    async (blob: Blob, extension: string, mimeType: string) => {
      if (!currentUserId) {
        throw new Error("Missing user id");
      }

      const safeExt = extension || CROPPED_FILE_EXT;
      const filePath = `${currentUserId}/${Date.now()}.${safeExt}`;

      const uploadResult = await supabase.storage
        .from(PROFILE_PHOTO_BUCKET)
        .upload(filePath, blob, {
          cacheControl: "3600",
          upsert: true,
          contentType: mimeType,
        });

      if (uploadResult.error) {
        throw uploadResult.error;
      }

      const { data: publicUrlData } = supabase.storage
        .from(PROFILE_PHOTO_BUCKET)
        .getPublicUrl(filePath);

      if (!publicUrlData?.publicUrl) {
        throw new Error("Unable to publish profile photo URL");
      }

      return publicUrlData.publicUrl;
    },
    [currentUserId, supabase],
  );

  const handleProfilePhotoUpload = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    if (!currentUserId) return;
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_PROFILE_PHOTO_BYTES) {
      setProfileError(t("employee.home.profilePrompt.errors.photoTooLarge"));
      event.target.value = "";
      return;
    }

    if (isGifFile(file)) {
      setProfilePhotoUploading(true);
      setProfileError(null);
      try {
        const extension = getFileExtension(file.name, "gif");
        const publicUrl = await uploadProfilePhotoBlob(
          file,
          extension,
          file.type || "image/gif",
        );
        setProfilePhotoUrl(publicUrl);
        setSelectedPresetAvatarId(null);
      } catch (error) {
        console.error("[EmployeeHome] gif upload failed", error);
        const message =
          error instanceof Error
            ? error.message
            : t("employee.home.profilePrompt.errors.photoUploadFailed");
        setProfileError(message);
      } finally {
        setProfilePhotoUploading(false);
        event.target.value = "";
      }
      return;
    }

    try {
      const reader = new FileReader();
      const dataUrlPromise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
      });
      reader.readAsDataURL(file);
      const dataUrl = await dataUrlPromise;
      setProfileCropImageSrc(dataUrl);
      setProfileCrop({ x: 0, y: 0 });
      setProfileCropZoom(1);
      setProfileCroppedAreaPixels(null);
      setProfileCropModalOpen(true);
      setSelectedPresetAvatarId(null);
      setProfileError(null);
    } catch (error) {
      console.error("[EmployeeHome] profile photo read failed", error);
      const message =
        error instanceof Error
          ? error.message
          : t("employee.home.profilePrompt.errors.photoUploadFailed");
      setProfileError(message);
    } finally {
      event.target.value = "";
    }
  };

  const handleProfileCropMediaLoaded = (media: MediaSize) => {
    setProfileCroppedAreaPixels({
      x: 0,
      y: 0,
      width: media.width,
      height: media.height,
    });
  };

  const handleProfileCropCancel = () => {
    setProfileCropModalOpen(false);
    setProfileCropImageSrc(null);
    setProfileCroppedAreaPixels(null);
    setProfileCrop({ x: 0, y: 0 });
    setProfileCropZoom(1);
    if (profileUploadInputRef.current) {
      profileUploadInputRef.current.value = "";
    }
  };

  const handleProfileCropApply = async () => {
    if (!profileCropImageSrc || !profileCroppedAreaPixels) {
      setProfileError(t("employee.home.profilePrompt.errors.photoUploadFailed"));
      return;
    }

    setProfilePhotoUploading(true);
    setProfileError(null);

    try {
      const blob = await getCroppedBlob(
        profileCropImageSrc,
        profileCroppedAreaPixels,
        CROPPED_OUTPUT_SIZE,
        CROPPED_MIME_TYPE,
      );
      const publicUrl = await uploadProfilePhotoBlob(
        blob,
        CROPPED_FILE_EXT,
        CROPPED_MIME_TYPE,
      );
      setProfilePhotoUrl(publicUrl);
      setProfileCropModalOpen(false);
      setProfileCropImageSrc(null);
      setProfileCroppedAreaPixels(null);
      setProfileCrop({ x: 0, y: 0 });
      setProfileCropZoom(1);
    } catch (error) {
      console.error("[EmployeeHome] crop/upload failed", error);
      const message =
        error instanceof Error
          ? error.message
          : t("employee.home.profilePrompt.errors.photoUploadFailed");
      setProfileError(message);
    } finally {
      setProfilePhotoUploading(false);
      if (profileUploadInputRef.current) {
        profileUploadInputRef.current.value = "";
      }
    }
  };

  const handleCompleteProfileCustomization = async () => {
    if (!currentUserId) return;
    const trimmedName = profileDisplayName.trim();
    if (!trimmedName) {
      setProfileError(t("employee.home.profilePrompt.errors.nameRequired"));
      return;
    }
    const trimmedPhotoUrl = profilePhotoUrl?.trim();
    if (!trimmedPhotoUrl) {
      setProfileError(t("employee.home.profilePrompt.errors.photoRequired"));
      return;
    }
    const trimmedDescription = profileDescription.trim();

    setProfileSubmitting(true);
    setProfileError(null);
    try {
      const { error: profileErr } = await supabase
        .from("profiles")
        .upsert(
          {
            id: currentUserId,
            display_name: trimmedName,
            photo_url: trimmedPhotoUrl,
            profile_title: trimmedDescription || null,
          },
          { onConflict: "id" },
        );

      if (profileErr) {
        throw profileErr;
      }

      const { error: metadataErr } = await supabase.auth.updateUser({
        data: {
          profile_customized: true,
        },
      });

      if (metadataErr) {
        throw metadataErr;
      }

      setProfileNeedsSetup(false);
      setProfileModalOpen(false);
      if (pendingAnnouncement) {
        setAnnouncementToShow(pendingAnnouncement);
        setPendingAnnouncement(null);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("employee.home.profilePrompt.errors.generic");
      setProfileError(message);
    } finally {
      setProfileSubmitting(false);
    }
  };

  useEffect(() => {
  console.log("[EmployeeHome][DEBUG] useEffect started");
  let cancelled = false;
  (async () => {
    console.log("[EmployeeHome][DEBUG] async function started");
    setLoading(true);
      setProfileError(null);

      const today = new Date();
      const referenceDate = new Date(today);
      referenceDate.setDate(referenceDate.getDate() + weekOffset * 7);
      const weekStart = startOfWeek(referenceDate, 0);
      const weekEnd = endOfWeek(referenceDate, 0);
      const label = labelForWeek(referenceDate, locale, weekPrefix);

      // 1) Auth
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user ?? null;
      const uid: string | undefined = user?.id;
      setCurrentUserId(uid ?? null);
      setCurrentUserEmail(user?.email ?? null);
      if (!uid) {
        if (!cancelled) {
          setAwaitingAuthorization(false);
          setEmploymentState(null);
          setProfileNeedsSetup(false);
          setProfileModalOpen(false);
          setDays(defaultEmptyWeek(weekStart));
          setWeekLabel(label);
          setHadRealAssignments(false);
          setDayFlags({});
          setDroppedShifts([]);
          setLoading(false);
          setCurrentUserEmail(null);
        }
        return;
      }

      const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
      const metadataProfileDone = Boolean(metadata?.profile_customized);
      const metadataDescription =
        typeof metadata?.profile_title === "string"
          ? (metadata.profile_title as string)
          : "";

      let profileNamePrefill = "";
      let profilePhotoPrefill: string | null = null;
      let profileDescriptionPrefill = metadataDescription;

      try {
        const { data: profileRow } = await supabase
          .from("profiles")
          .select("display_name,photo_url,profile_title")
          .eq("id", uid)
          .maybeSingle();

        profileNamePrefill = (profileRow?.display_name as string | null) ?? "";
        profilePhotoPrefill = (profileRow?.photo_url as string | null) ?? null;
        profileDescriptionPrefill =
          (profileRow?.profile_title as string | null) ?? metadataDescription;
      } catch (e) {
        console.error("[EmployeeHome] profile prefill error", e);
      }

      // Set the UI state for profile fields
      if (!cancelled) {
        setProfileDisplayName(profileNamePrefill);
        const fallbackAvatar = PRESET_AVATARS[0];
        const nextPhoto = profilePhotoPrefill ?? fallbackAvatar.url;
        const presetMatch = profilePhotoPrefill
          ? PRESET_AVATARS.find((avatar) => avatar.url === profilePhotoPrefill)
          : fallbackAvatar;
        setProfilePhotoUrl(nextPhoto);
        setSelectedPresetAvatarId(presetMatch ? presetMatch.id : null);
        setProfileDescription(profileDescriptionPrefill ?? "");
      }

      // Enhanced debugging: check each condition explicitly
      const hasProfileName = profileNamePrefill.trim().length > 0;
      const hasProfilePhoto = profilePhotoPrefill !== null && profilePhotoPrefill !== "";
      const profileCompleted = Boolean(metadataProfileDone);

      console.log("[EmployeeHome][DEBUG] Profile conditions:");
      console.log("  - metadataProfileDone (profile completed):", profileCompleted);
      console.log("  - hasProfileName:", hasProfileName, "(name:", profileNamePrefill, ")");
      console.log("  - hasProfilePhoto:", hasProfilePhoto, "(photo:", profilePhotoPrefill, ")");

      const shouldPromptProfile = !profileCompleted || !hasProfileName || !hasProfilePhoto;

      console.log("[EmployeeHome][DEBUG] shouldPromptProfile result:", shouldPromptProfile);

      // Now continue with employment checks...
      // 2) Active employment

      // 2) Active employment
      const { data: emps, error: empErr } = await supabase
        .from("employment")
        .select(
          "id,user_id,business_id,location_id,role_id,status,is_manager,is_admin",
        )
        .eq("user_id", uid)
        .eq("status", "active");

      if (empErr) {
        console.error("[EmployeeHome] employment load error", empErr);
      }

      if (!emps || emps.length === 0) {
        const awaiting = await hasPendingAccess(supabase, uid);
        if (!cancelled) {
          setAwaitingAuthorization(awaiting);
          setEmploymentState(null);
          setProfileNeedsSetup(false);
          setProfileModalOpen(false);
          setDays(defaultEmptyWeek(weekStart));
          setWeekLabel(label);
          setHadRealAssignments(false);
          setDayFlags({});
          setDroppedShifts([]);
          setLoading(false);
        }
        return;
      }
      const employment: Employment = emps[0];
      if (!cancelled) {
        setEmploymentState(employment);
        setAwaitingAuthorization(false);
      }

      try {
        const { data: ownerRow, error: ownerErr } = await supabase
          .from("business")
          .select("owner_user_id")
          .eq("id", employment.business_id)
          .maybeSingle();
        if (ownerErr) {
          console.error("[EmployeeHome] business owner load error", ownerErr);
        }
        if (!cancelled) {
          setBusinessOwnerId((ownerRow?.owner_user_id as string | null) ?? null);
        }
      } catch (ownerFetchErr) {
        console.error("[EmployeeHome] business owner fetch exception", ownerFetchErr);
      }

      const flagsByIndex: Record<number, DayFlags> = {};
      for (let i = 0; i < 7; i++) {
        flagsByIndex[i] = {
          hasTimeOff: false,
          isUnavailableByAvailability: false,
        };
      }

      const todayISODate = today.toISOString().split("T")[0];

      // 3a) Availability
      try {
        const { data: availRows, error: availErr } = await supabase
          .from("availability")
          .select("weekly_pattern_json,effective_from,effective_to,status")
          .eq("user_id", uid)
          .eq("status", "approved")
          .lte("effective_from", todayISODate)
          .or(`effective_to.is.null,effective_to.gte.${todayISODate}`)
          .order("effective_from", { ascending: false });

        if (!availErr && availRows && availRows.length > 0) {
          const rows = availRows as AvailabilityRowLite[];
          const current = rows[0];

          if (current) {
            const pattern = normalizePattern(current.weekly_pattern_json);

            for (let i = 0; i < 7; i++) {
              const key = DAY_KEYS[i];
              const statusForDay = pattern[key];
              if (statusForDay === "unavailable") {
                flagsByIndex[i].isUnavailableByAvailability = true;
              }
            }
          }
        }
      } catch (e) {
        console.error("[EmployeeHome] availability load error", e);
      }

      // 3b) Time off
      try {
        const { data: torRows, error: torErr } = await supabase
          .from("time_off_request")
          .select("start_ts,end_ts,status")
          .eq("user_id", uid)
          .eq("status", "approved");

        if (!torErr && torRows && torRows.length > 0) {
          const rows = torRows as TORowLite[];

          for (const r of rows) {
            const startRaw = new Date(r.start_ts);
            const endRaw = new Date(r.end_ts);
            const lastIncluded = new Date(endRaw.getTime() - 1);

            let cur = normalizeToLocalDay(startRaw);
            const lastDay = normalizeToLocalDay(lastIncluded);

            while (cur <= lastDay) {
              const curMs = cur.getTime();
              if (
                curMs >= normalizeToLocalDay(weekStart).getTime() &&
                curMs <= normalizeToLocalDay(weekEnd).getTime()
              ) {
                const idx = cur.getDay();
                const existing = flagsByIndex[idx];

                if (!existing.hasTimeOff) {
                  flagsByIndex[idx].hasTimeOff = true;
                  flagsByIndex[idx].timeOffStatus = r.status;
                } else if (
                  existing.timeOffStatus === "pending" &&
                  r.status === "approved"
                ) {
                  flagsByIndex[idx].timeOffStatus = "approved";
                }
              }

              cur = new Date(cur);
              cur.setDate(cur.getDate() + 1);
            }
          }
        }
      } catch (e) {
        console.error("[EmployeeHome] time off load error", e);
      }

      // 4) Assignments for user
      const { data: saRows, error: saErr } = await supabase
        .from("shift_assignment")
        .select(
          "id,shift_id,user_id,assigned_by,assigned_at,status,source,drop_reason,responded_at",
        )
        .eq("user_id", uid);

      if (!saErr && saRows && saRows.length > 0) {
        const assignments = saRows as ShiftAssignmentRow[];

        const shiftIds: string[] = Array.from(
          new Set(assignments.map((r) => r.shift_id)),
        );

        const { data: shifts, error: shErr } = await supabase
          .from("shift")
          .select("id,business_id,location_id,role_id,start_ts,end_ts,status")
          .in("id", shiftIds)
          .neq("status", "canceled")
          .gte("start_ts", weekStart.toISOString())
          .lte("start_ts", weekEnd.toISOString());

        if (!shErr && shifts && shifts.length > 0) {
          const shiftRows = shifts as ShiftRow[];

          const roleIds = Array.from(new Set(shiftRows.map((s) => s.role_id)));
          const locIds = Array.from(new Set(shiftRows.map((s) => s.location_id)));

          const [{ data: roles }, { data: locs }] = await Promise.all([
            roleIds.length
              ? supabase.from("role").select("id,name,color").in("id", roleIds)
              : Promise.resolve({ data: null } as { data: RoleRow[] | null }),
            locIds.length
              ? supabase.from("location").select("id,name").in("id", locIds)
              : Promise.resolve({
                data: null,
              } as { data: LocationRow[] | null }),
          ]);

          const roleById: Record<string, RoleRow> = {};
          if (roles)
            for (const r of roles as RoleRow[]) roleById[r.id] = r;

          const locById: Record<string, LocationRow> = {};
          if (locs)
            for (const l of locs as LocationRow[]) locById[l.id] = l;

          const assignmentByShiftId: Record<string, ShiftAssignmentRow> = {};
          for (const a of assignments) {
            assignmentByShiftId[a.shift_id] = a;
          }

          const activeShiftRows: ShiftRow[] = [];
          const dropped: DroppedShift[] = [];

          for (const s of shiftRows) {
            const a = assignmentByShiftId[s.id];
            if (!a) continue;

            const shiftDate = new Date(s.start_ts);
            const weekdayIndex = shiftDate.getDay();
            const role = s.role_id ? (roleById[s.role_id]?.name ?? shiftFallbackLabel) : shiftFallbackLabel;
            const locationName = s.location_id ? (locById[s.location_id]?.name ?? null) : null;

            if (a.status === "dropped") {
              dropped.push({
                assignmentId: a.id,
                shiftId: s.id,
                date: shiftDate,
                weekdayIndex,
                role,
                locationName,
                start: fmtTimeLocal(s.start_ts, locale),
                end: fmtTimeLocal(s.end_ts, locale),
                status: "dropped",
              });
              activeShiftRows.push(s);
            } else if (a.status !== "declined") {
              activeShiftRows.push(s);
            }
          }

          const withMeta: ShiftWithMeta[] = activeShiftRows.map((s) => ({
            shift: s,
            role: s.role_id ? (roleById[s.role_id] ?? null) : null,
            location: s.location_id ? (locById[s.location_id] ?? null) : null,
          }));

          const buckets = buildBucketsFromShifts(
            withMeta,
            assignmentByShiftId,
            locale,
            shiftFallbackLabel,
            weekStart,
          );

          dropped.sort((a, b) => {
            if (a.date.getTime() !== b.date.getTime()) {
              return a.date.getTime() - b.date.getTime();
            }
            return a.start.localeCompare(b.start);
          });

          if (!cancelled) {
            setDays(buckets);
            setWeekLabel(label);
            setHadRealAssignments(activeShiftRows.length > 0);
            setDayFlags(flagsByIndex);
            setDroppedShifts(dropped);
            setProfileNeedsSetup(shouldPromptProfile);
            setProfileModalOpen(shouldPromptProfile);
            setLoading(false);
          }
          return;
        }
      }

      // 6) Fallback templates
      let bucketsFromTemplates: DayBucket[] | null = null;
      const { data: templates, error: stErr } = await supabase
        .from("shift_template")
        .select(
          "id,business_id,role_id,location_id,weekday,start_time,end_time",
        )
        .eq("business_id", employment.business_id);

      if (!stErr && templates && templates.length > 0) {
        const filtered = templates.filter((t: ShiftTemplateRow) => {
          const roleOk = employment.role_id
            ? t.role_id === employment.role_id
            : true;
          const locOk = employment.location_id
            ? t.location_id === employment.location_id
            : true;
          return roleOk && locOk;
        });
        if (filtered.length > 0)
          bucketsFromTemplates = buildBucketsFromTemplates(
            filtered,
            weekStart,
            locale,
            typicalShiftLabel,
          );
      }

      if (!cancelled) {
        if (bucketsFromTemplates) {
          setDays(bucketsFromTemplates);
          setWeekLabel(`${label} • ${typicalWeekSuffix}`);
        } else {
          setDays(defaultEmptyWeek(weekStart));
          setWeekLabel(label);
        }
        setHadRealAssignments(false);
        setDayFlags(flagsByIndex);
        setDroppedShifts([]);
        setProfileNeedsSetup(shouldPromptProfile);
        setProfileModalOpen(shouldPromptProfile);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    supabase,
    refreshKey,
    weekOffset,
    locale,
    weekPrefix,
    shiftFallbackLabel,
    typicalShiftLabel,
    typicalWeekSuffix,
  ]);

  // When we know the current user and employment, check for announcements
  useEffect(() => {
    (async () => {
      if (!currentUserId || !employmentState || awaitingAuthorization) return;
      await maybeShowAnnouncementForUser(
        currentUserId,
        employmentState.role_id,
        currentUserEmail,
        businessOwnerId,
      );
    })();
  }, [
    currentUserId,
    employmentState,
    currentUserEmail,
    awaitingAuthorization,
    businessOwnerId,
    maybeShowAnnouncementForUser,
  ]);

  useEffect(() => {
    if (
      !profileNeedsSetup &&
      !profileModalOpen &&
      pendingAnnouncement &&
      !announcementToShow
    ) {
      setAnnouncementToShow(pendingAnnouncement);
      setPendingAnnouncement(null);
    }
  }, [
    profileNeedsSetup,
    profileModalOpen,
    pendingAnnouncement,
    announcementToShow,
  ]);

  if (awaitingAuthorization) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-card px-6 py-10 text-center shadow-sm">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <AlertCircle className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">
            {t("employee.home.awaitingAccess.title")}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {t("employee.home.awaitingAccess.body")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("employee.home.awaitingAccess.helper")}
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              {t("employee.home.awaitingAccess.refresh")}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full rounded-lg border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
            >
              {t("employee.home.awaitingAccess.logout")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const loadCoworkersForDay = async (date: Date) => {
    if (!employmentState) return;
    setCoworkers([]);
    setCoworkersLoading(true);
    try {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const { data: dayShifts, error: dayShErr } = await supabase
        .from("shift")
        .select("id")
        .eq("business_id", employmentState.business_id)
        .neq("status", "canceled")
        .gte("start_ts", dayStart.toISOString())
        .lt("start_ts", dayEnd.toISOString());

      if (dayShErr || !dayShifts || dayShifts.length === 0) {
        setCoworkers([]);
        setCoworkersLoading(false);
        return;
      }

      const dayShiftIds = (dayShifts as { id: string }[]).map((d) => d.id);

      const { data: dayAssignments, error: daErr } = await supabase
        .from("shift_assignment")
        .select("user_id")
        .in("shift_id", dayShiftIds)
        .in("status", ["assigned", "accepted", "offered", "dropped"]);

      if (daErr || !dayAssignments || dayAssignments.length === 0) {
        setCoworkers([]);
        setCoworkersLoading(false);
        return;
      }

      const userIds = Array.from(
        new Set(
          (dayAssignments as { user_id: string }[]).map((a) => a.user_id),
        ),
      );

      const { data: profs, error: profErr } = await supabase
        .from("profiles")
        .select("id, full_name, display_name, email")
        .in("id", userIds);

      if (profErr || !profs) {
        setCoworkers([]);
        setCoworkersLoading(false);
        return;
      }

      const profList = (profs ?? []) as ProfileRow[];
      const mapped = profList.map((p) => ({
        id: p.id,
        name:
          p.full_name || p.display_name || p.email || t("shared.labels.unnamed"),
      }));

      setCoworkers(mapped);
    } catch (e) {
      console.error("[EmployeeHome] load coworkers error", e);
      setCoworkers([]);
    } finally {
      setCoworkersLoading(false);
    }
  };

  const handleShiftClick = async (bucket: DayBucket, s: BucketShift) => {
    if (!s.shiftId || s.isDropPending) return;
    setDropReason("");
    setDropError(null);

    const sel: SelectedShift = {
      shiftId: s.shiftId,
      assignmentId: s.assignmentId ?? null,
      date: bucket.date,
      weekdayIndex: bucket.dayIndex,
      role: s.role,
      locationName: s.locationName ?? null,
      start: s.start,
      end: s.end,
    };

    setSelectedShift(sel);
    await loadCoworkersForDay(bucket.date);
  };

  const handleConfirmDrop = async () => {
    if (!selectedShift || !selectedShift.assignmentId || !currentUserId) return;

    const reason = dropReason.trim();
    if (!reason) {
      setDropError(t("employee.home.errors.reasonRequired"));
      return;
    }

    setDropSubmitting(true);
    setDropError(null);
    try {
      const { error } = await supabase
        .from("shift_assignment")
        .update({
          status: "dropped",
          drop_reason: reason,
          responded_at: new Date().toISOString(),
        })
        .eq("id", selectedShift.assignmentId)
        .eq("user_id", currentUserId);

      if (error) {
        console.error("[EmployeeHome] drop shift error", error);
        setDropError(t("employee.home.errors.dropFailed"));
        setDropSubmitting(false);
        return;
      }

      setSelectedShift(null);
      setDropReason("");
      setDropError(null);
      setRefreshKey((k) => k + 1);

      // create announcement for dropped shift
      try {
        let senderName = t("shared.messages.employeeFallback");
        try {
          const { data: prof } = await supabase
            .from("profiles")
            .select("full_name,display_name,email")
            .eq("id", currentUserId)
            .maybeSingle();
          if (prof) senderName = prof.full_name || prof.display_name || prof.email || senderName;
        } catch {
          // ignore profile lookup errors
        }

        const title = t("employee.home.drop.announcementTitle", { name: senderName });
        const baseContent = t("employee.home.drop.announcementBody", {
          day: weekLabel[selectedShift.weekdayIndex],
          date: fmtDateMMDD(selectedShift.date, locale),
          range: `${selectedShift.start} – ${selectedShift.end}`,
        });
        const reasonBlock = reason
          ? `\n\n${t("shared.labels.reason")}: ${reason}`
          : "";
        const content = `${baseContent}${reasonBlock}`;
        if (currentUserId) {
          await createAnnouncement(supabase, currentUserId, title, content, []);
        }
      } catch (e) {
        console.error("Failed to create announcement for dropped shift:", e);
      }
    } catch (e) {
      console.error("[EmployeeHome] drop shift exception", e);
      setDropError(t("employee.home.errors.generic"));
    } finally {
      setDropSubmitting(false);
    }
  };

  // ---- Render ----
  return (
    <div className="min-h-screen bg-muted/50 pb-12 overflow-x-hidden">
      <header className="px-4 pt-4 pb-6">
        <div className="mx-auto flex max-w-sm flex-col items-center gap-2 text-center">
          <NextImage
            src="/scheduleitlogo.png"
            alt="Schedule-It"
            width={56}
            height={56}
            priority
            className="drop-shadow-sm"
          />
          <div className="text-2xl font-semibold text-primary">
            Schedule<span className="text-accent">It</span>
          </div>
          <div className="text-[11px] uppercase tracking-[0.35em] text-secondary">
            Schedule it your way!
          </div>
        </div>
      </header>
      <main className="px-4 lg:px-8 py-6 w-full max-w-4xl mx-auto">
        <div className="mb-6 text-center sm:text-left">
          <h1 className="text-2xl font-semibold text-foreground">
            {t("employee.home.schedule.heading")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("employee.home.header.description", { week: weekLabel })}
          </p>
        </div>

        <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto w-full">
          <div className="rounded-xl border border-border bg-background p-4 text-center sm:text-left">
            <p className="text-xs text-muted-foreground">
              {t("employee.home.metrics.totalShifts")}
            </p>
            <p className="text-xl font-semibold">{totalShiftsThisWeek}</p>
          </div>
          <div className="rounded-xl border border-border bg-background p-4 text-center sm:text-left">
            <p className="text-xs text-muted-foreground">
              {t("employee.home.metrics.daysOff")}
            </p>
            <p className="text-xl font-semibold">{daysWithoutScheduledShifts}</p>
          </div>
          <div className="rounded-xl border border-border bg-background p-4 text-center sm:text-left">
            <p className="text-xs text-muted-foreground">
              {t("employee.home.metrics.timeOffDays")}
            </p>
            <p className="text-xl font-semibold">{daysWithTimeOff}</p>
          </div>
        </div>

        <div className="bg-background rounded-xl shadow-sm border border-border w-full mx-auto">
          <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-medium text-foreground">
              {t("employee.home.schedule.heading")}
            </div>
            <div className="flex items-center gap-2 justify-center sm:justify-end">
              <button
                type="button"
                onClick={() => setWeekOffset((w) => w - 1)}
                className="px-2 py-1 rounded-md border border-border hover:bg-muted text-xs"
                aria-label={t("employee.home.nav.previousWeek")}
              >
                ‹
              </button>
              {/* Desktop: show weekday names across the top. Mobile: keep week label. */}
              <span className="hidden sm:inline text-xs text-muted-foreground">
                {days && days.length
                  ? days
                      .map((d) =>
                        d.date.toLocaleDateString(locale ?? undefined, {
                          weekday: "long",
                        }),
                      )
                      .join(" - ")
                  : weekLabel}
              </span>
              <span className="sm:hidden text-xs text-muted-foreground">{weekLabel}</span>
              <button
                type="button"
                onClick={() => setWeekOffset((w) => w + 1)}
                className="px-2 py-1 rounded-md border border-border hover:bg-muted text-xs"
                aria-label={t("employee.home.nav.nextWeek")}
              >
                ›
              </button>
            </div>
          </div>

          <div
            className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4 lg:gap-px p-4 lg:p-0 bg-transparent lg:bg-border"
            role="list"
          >
            {days.map((bucket: DayBucket) => {
              const flags = dayFlags[bucket.dayIndex];
              const isToday =
                normalizeToLocalDay(bucket.date).getTime() === todayDate.getTime();
              return (
                <div
                  key={bucket.dayIndex}
                  className={`p-4 min-h-[200px] flex flex-col rounded-lg border border-border lg:rounded-none lg:border-none ${bucket.dayIndex % 2 === 1 ? "bg-muted/50" : "bg-background"}`}
                  role="listitem"
                >
                  <div className="text-center sm:text-left mb-2">
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-base font-semibold text-foreground">
                      <span>
                        {bucket.date.toLocaleDateString(locale ?? undefined, {
                          weekday: "long",
                        })}
                      </span>
                      {isToday && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          {t("employee.home.badges.today")}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-foreground/60 mt-1">
                      {fmtDateMMDD(bucket.date, locale)}
                    </div>
                  </div>

                  {flags &&
                    (flags.hasTimeOff || flags.isUnavailableByAvailability) && (
                      <div className="mb-3 space-y-1">
                        {flags.hasTimeOff && (
                          <div className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-800">
                            {flags.timeOffStatus === "approved"
                              ? t("employee.home.dayStatus.timeOffApproved")
                              : t("employee.home.dayStatus.timeOffRequested")}
                          </div>
                        )}
                        {flags.isUnavailableByAvailability && (
                          <div className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-[11px] font-medium text-purple-800">
                            {t("employee.home.dayStatus.unavailableAvailability")}
                          </div>
                        )}
                      </div>
                    )}

                  <div className="space-y-2 flex-1">
                    {bucket.shifts.length > 0 ? (
                      bucket.shifts.map((s, i) => (
                        <button
                          key={`${bucket.dayIndex}-${i}`}
                          type="button"
                          onClick={() => handleShiftClick(bucket, s)}
                          className="w-full text-left bg-teal-50 border border-teal-200 rounded-lg p-3 cursor-pointer hover:bg-teal-100 transition-colors disabled:cursor-default disabled:opacity-80"
                          style={s.color ? { borderColor: s.color } : undefined}
                          disabled={!s.shiftId || s.isDropPending}
                        >
                          <div className="text-xs font-semibold text-teal-900 mb-1 flex justify-between gap-2">
                            <span>
                              {s.role}
                              {s.locationName ? ` · ${s.locationName}` : ""}
                            </span>
                            <span className="flex gap-1">
                              {s.isPickedUp && (
                                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                                  {t("employee.home.shiftTags.pickedUp")}
                                </span>
                              )}
                              {s.isDropPending && (
                                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                                  {t("employee.home.shiftTags.dropPending")}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="text-xs text-teal-700 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {s.start} - {s.end}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="text-center py-4">
                        {flags?.hasTimeOff ? (
                          <div className="text-xs text-foreground/60">
                            {flags.timeOffStatus === "approved"
                              ? t("employee.home.dayStatus.timeOffApproved")
                              : t("employee.home.dayStatus.timeOffRequested")}
                          </div>
                        ) : flags?.isUnavailableByAvailability ? (
                          <div className="text-xs text-foreground/60">
                            {t("employee.home.dayStatus.unavailable")}
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground border border-border/70">
                            <Clock className="w-3 h-3 opacity-70" />
                            {t("employee.home.dayStatus.off")}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-6 text-xs text-muted-foreground px-4 pb-4 justify-center lg:justify-start">
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded bg-teal-200" />
              {t("employee.home.legend.assigned")}
            </div>
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded bg-amber-200" />
              {t("employee.home.legend.timeOff")}
            </div>
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded bg-purple-200" />
              {t("employee.home.legend.unavailable")}
            </div>
          </div>
          {!loading && !hadRealAssignments && hasAnyContentThisWeek === false && (
            <div className="border-t border-border px-4 py-8">
              <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/5 via-background to-background p-6 text-center shadow-sm">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Clock className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-foreground">
                  {t("employee.home.emptyWeek.title", {
                    defaultValue: "You're clear this week",
                  })}
                </h3>
                <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
                  {t("employee.home.emptyWeek.body")}
                </p>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <button
                    type="button"
                    onClick={() => router.push("/employeemanagement/entire-schedule")}
                    className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90"
                  >
                    {t("employee.home.emptyWeek.primaryAction")}
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/employeemanagement/messages")}
                    className="inline-flex items-center justify-center rounded-full border border-border px-6 py-2 text-sm font-semibold text-foreground transition hover:border-primary/50 hover:text-primary"
                  >
                    {t("employee.home.emptyWeek.secondaryAction")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <section className="mt-8 w-full mx-auto">
          <h2 className="text-lg font-semibold text-foreground">
            {t("employee.home.section.dropped.title")}
          </h2>
          <p className="text-sm text-foreground/70 mt-1">
            {t("employee.home.section.dropped.description")}
          </p>

          <div className="mt-3 bg-background rounded-xl shadow-sm border border-border overflow-hidden">
            {droppedShifts.length === 0 ? (
              <div className="px-4 py-6 text-sm text-foreground/60 text-center">
                {t("employee.home.section.dropped.empty")}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {droppedShifts.map((ds) => (
                  <li
                    key={ds.assignmentId}
                    className="px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">
                        {weekLabel[ds.weekdayIndex]} · {fmtDateMMDD(ds.date, locale)}
                      </div>
                      <div className="text-xs text-foreground/70 mt-0.5">
                        {ds.locationName && (
                          <>
                            {ds.locationName}
                            {" · "}
                          </>
                        )}
                        {ds.role} · {ds.start} - {ds.end}
                      </div>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-800">
                      {t("employee.home.section.dropped.badge")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

      </main>



      {profileModalOpen && profileNeedsSetup && (
        <div className="fixed inset-0 z-50 bg-black/45">
          <div className="flex min-h-screen items-start justify-center overflow-y-auto px-4 py-10">
            <div className="w-full max-w-2xl rounded-2xl border border-border bg-background px-6 py-8 shadow-2xl max-h-[95vh] overflow-y-auto">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary/80">
                {t("employee.home.profilePrompt.title")}
              </p>
              <h2 className="text-2xl font-semibold text-foreground">
                {t("employee.home.profilePrompt.subtitle")}
              </h2>
            </div>
            <div className="mt-6 space-y-6">
              <div>
                <label className="text-sm font-medium text-foreground">
                  {t("employee.home.profilePrompt.displayNameLabel")}
                </label>
                <input
                  type="text"
                  value={profileDisplayName}
                  onChange={(event) => setProfileDisplayName(event.target.value)}
                  placeholder={t("employee.home.profilePrompt.displayNamePlaceholder")}
                  className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">
                  {t("employee.home.profilePrompt.profileLabel")}
                </label>
                <textarea
                  value={profileDescription}
                  onChange={(event) => setProfileDescription(event.target.value)}
                  placeholder={t("employee.home.profilePrompt.profilePlaceholder")}
                  className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  rows={2}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("employee.home.profilePrompt.helper")}
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">
                    {t("employee.home.profilePrompt.photoLabel")}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {t("employee.home.profilePrompt.photoHelper")}
                  </p>
                </div>
                <div className="mt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("employee.home.profilePrompt.photoPresetLabel")}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    {PRESET_AVATARS.map((avatar) => {
                      const isActive = selectedPresetAvatarId === avatar.id;
                      return (
                        <button
                          key={avatar.id}
                          type="button"
                          onClick={() => handleSelectPresetAvatar(avatar.id, avatar.url)}
                          className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-2 text-center text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${isActive ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/60"}`}
                          aria-pressed={isActive}
                        >
                          <NextImage
                            src={avatar.url}
                            alt={avatar.label}
                            width={56}
                            height={56}
                            className="h-14 w-14 rounded-full border border-border object-cover"
                          />
                          <span>{avatar.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("employee.home.profilePrompt.photoUploadLabel")}
                  </p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label className="inline-flex w-full cursor-pointer items-center justify-center rounded-lg border border-dashed border-border px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:border-primary/60 sm:w-auto">
                      <input
                        ref={profileUploadInputRef}
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={handleProfilePhotoUpload}
                        disabled={profilePhotoUploading}
                      />
                      {profilePhotoUploading
                        ? t("employee.home.profilePrompt.photoUploading")
                        : t("employee.home.profilePrompt.photoUploadButton")}
                    </label>
                    <p className="text-xs text-muted-foreground">
                      {t("employee.home.profilePrompt.photoUploadHint")}
                    </p>
                  </div>
                </div>
                {profilePhotoUrl && (
                  <div className="mt-4 flex items-center gap-3">
                    <NextImage
                      src={profilePhotoUrl}
                      alt={t("employee.home.profilePrompt.photoPreviewAlt")}
                      width={64}
                      height={64}
                      className="h-16 w-16 rounded-full border border-border object-cover"
                      unoptimized={isGifUrl(profilePhotoUrl)}
                    />
                    <button
                      type="button"
                      onClick={handleResetPhotoSelection}
                      className="text-xs font-semibold text-destructive hover:underline"
                    >
                      {t("employee.home.profilePrompt.photoRemove")}
                    </button>
                  </div>
                )}
              </div>
              {profileError && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {profileError}
                </div>
              )}
                <button
                  type="button"
                  onClick={handleCompleteProfileCustomization}
                  disabled={profileSubmitting || profilePhotoUploading}
                  className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-70"
                >
                  {profileSubmitting
                    ? t("employee.home.profilePrompt.submitting")
                    : t("employee.home.profilePrompt.submit")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {profileCropModalOpen && profileCropImageSrc && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
          <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-background p-6 shadow-2xl">
            <button
              type="button"
              aria-label={t("shared.buttons.close")}
              className="absolute right-4 top-4 rounded-full border border-transparent p-1 text-muted-foreground transition hover:text-foreground"
              onClick={handleProfileCropCancel}
              disabled={profilePhotoUploading}
            >
              <span className="text-lg">×</span>
            </button>
            <h3 className="text-lg font-semibold text-foreground">
              {t("settings.profile.cropper.title")}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("settings.profile.cropper.guide")}
            </p>
            <div className="mt-3 flex w-full justify-center">
              <div className="relative aspect-square w-full max-w-[480px] overflow-hidden rounded-2xl bg-black/70">
                <Cropper
                  image={profileCropImageSrc}
                  crop={profileCrop}
                  zoom={profileCropZoom}
                  aspect={1}
                  onMediaLoaded={handleProfileCropMediaLoaded}
                  onCropChange={setProfileCrop}
                  onZoomChange={setProfileCropZoom}
                  onCropComplete={(_, croppedPixels) => setProfileCroppedAreaPixels(croppedPixels)}
                  objectFit="cover"
                  showGrid
                />
                <div
                  className="pointer-events-none absolute inset-4 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"
                  aria-hidden="true"
                />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <label className="text-sm font-medium text-foreground">
                {t("settings.profile.cropper.zoomLabel")}
              </label>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={profileCropZoom}
                onChange={(event) => setProfileCropZoom(Number(event.target.value))}
                className="flex-1 accent-primary"
                disabled={profilePhotoUploading}
              />
            </div>
            {!profileCroppedAreaPixels && (
              <p className="mt-2 text-xs text-amber-500">
                {t("settings.profile.cropper.applyDisabled")}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleProfileCropCancel}
                disabled={profilePhotoUploading}
                className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                {t("settings.profile.cropper.cancel")}
              </button>
              <button
                type="button"
                onClick={handleProfileCropApply}
                disabled={profilePhotoUploading || !profileCroppedAreaPixels}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold text-white ${
                  profilePhotoUploading || !profileCroppedAreaPixels
                    ? "bg-primary/50"
                    : "bg-primary hover:bg-primary/90"
                }`}
              >
                {profilePhotoUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {t("settings.profile.cropper.apply")}
              </button>
            </div>
          </div>
        </div>
      )}

      { }
      {announcementToShow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-background shadow-2xl">
            <div className="flex items-start justify-between border-b border-border/70 px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary/80">
                  {t("employee.home.announcement.newLabel")}
                </p>
                <h2 className="text-xl font-semibold text-foreground">
                  {announcementToShow.announcement.title}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("employee.announcements.from", {
                    name: announcementToShow.senderName,
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={handleDismissAnnouncement}
                className="rounded-full border border-border/70 p-1 text-muted-foreground transition hover:border-border hover:text-foreground"
              >
                <span className="sr-only">{t("shared.buttons.close")}</span>
                ×
              </button>
            </div>
            <div className="px-6 py-5 text-sm leading-relaxed text-foreground">
              {announcementToShow.announcement.content}
              {announcementToShow.announcement.attachment && (
                <AttachmentPreview
                  url={announcementToShow.announcement.attachment.url}
                  name={announcementToShow.announcement.attachment.name}
                  mime={announcementToShow.announcement.attachment.mime}
                  size={announcementToShow.announcement.attachment.size}
                  downloadLabel={t("employee.messages.attachments.download")}
                />
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border/70 px-6 py-4 text-xs text-muted-foreground">
              <span>
                {t("employee.home.announcement.timestamp", {
                  timestamp: announcementTimestampLabel(
                    announcementToShow.announcement.created_at,
                  ),
                })}
              </span>
              <div className="flex gap-2">
                {announcementToShow.announcement.created_by ===
                  currentUserId && (
                    <button
                      type="button"
                      onClick={() =>
                        handleDeleteAnnouncement(announcementToShow.announcement.id)
                      }
                      disabled={announcementDeleteLoading}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-destructive/80 hover:border-destructive disabled:opacity-50"
                    >
                      {announcementDeleteLoading
                        ? t("employee.home.announcement.deleting")
                        : t("employee.home.announcement.delete")}
                    </button>
                  )}
                <button
                  type="button"
                  onClick={handleDismissAnnouncement}
                  className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
                >
                  {t("shared.buttons.gotIt")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Drop shift modal */}
      {selectedShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {selectedShift.role}
                  {selectedShift.locationName
                    ? ` · ${selectedShift.locationName}`
                    : ""}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {weekLabel[selectedShift.weekdayIndex]} · {" "}
                  {fmtDateMMDD(selectedShift.date, locale)} · {selectedShift.start} –{" "}
                  {selectedShift.end}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedShift(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="sr-only">{t("shared.buttons.close")}</span>
                ×
              </button>
            </div>

            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-900">
                {t("employee.home.coworkers.header")}
              </h3>
              {coworkersLoading ? (
                <p className="mt-1 text-sm text-gray-500">
                  {t("shared.state.loading")}
                </p>
              ) : coworkers.length === 0 ? (
                <p className="mt-1 text-sm text-gray-500">
                  {t("employee.home.coworkers.empty")}
                </p>
              ) : (
                <ul className="mt-2 space-y-1 max-h-32 overflow-y-auto text-sm text-gray-700">
                  {coworkers.map((c) => (
                    <li key={c.id}>
                      {c.name}
                      {c.id === currentUserId
                        ? ` ${t("shared.labels.youIndicator")}`
                        : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-5">
              <label className="block text-sm font-medium text-gray-900 mb-1">
                {t("employee.home.modal.reasonLabel")}
              </label>
              <textarea
                value={dropReason}
                onChange={(e) => setDropReason(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                placeholder={t("employee.home.modal.reasonPlaceholder")}
              />
              {dropError && (
                <p className="mt-1 text-sm text-red-600">{dropError}</p>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedShift(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                disabled={dropSubmitting}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={handleConfirmDrop}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-60"
                disabled={dropSubmitting}
              >
                {dropSubmitting
                  ? t("employee.home.modal.submitting")
                  : t("employee.home.modal.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Builders ----
function defaultEmptyWeek(referenceStart?: Date): DayBucket[] {
  const start = referenceStart ? new Date(referenceStart) : startOfWeek(new Date(), 0);
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_: unknown, i: number) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { dayIndex: i, date: d, shifts: [] };
  });
}

function labelForWeek(reference: Date, locale?: string, prefix = "Week of"): string {
  const start = startOfWeek(reference, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const startLabel = start.toLocaleDateString(locale ?? undefined, {
    month: "long",
    day: "numeric",
  });
  const endLabel = end.toLocaleDateString(locale ?? undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return `${prefix} ${startLabel} - ${endLabel}`;
}

function buildBucketsFromShifts(
  rows: ShiftWithMeta[],
  assignmentByShiftId: Record<string, ShiftAssignmentRow>,
  locale?: string,
  shiftFallback = "Shift",
  weekStart?: Date,
): DayBucket[] {
  const buckets = defaultEmptyWeek(weekStart);
  for (const r of rows) {
    const s = new Date(r.shift.start_ts);
    const idx = s.getDay();
    const roleName = r.role?.name ?? shiftFallback;
    const color = r.role?.color ?? null;
    const locationName = r.location?.name ?? null;
    const assignment = assignmentByShiftId[r.shift.id];

    buckets[idx].shifts.push({
      shiftId: r.shift.id,
      assignmentId: assignment?.id ?? null,
      role: roleName,
      start: fmtTimeLocal(r.shift.start_ts, locale),
      end: fmtTimeLocal(r.shift.end_ts, locale),
      color,
      locationName,
      isDropPending: assignment?.status === "dropped",
      isPickedUp: assignment?.source === "swap",
    });
  }
  for (const b of buckets) {
    b.shifts.sort((a, b2) => a.start.localeCompare(b2.start));
  }
  return buckets;
}

function buildBucketsFromTemplates(
  templates: ShiftTemplateRow[],
  weekStart: Date,
  locale?: string,
  typicalShiftLabel = "Typical shift",
): DayBucket[] {
  const buckets = defaultEmptyWeek(weekStart);
  for (const t of templates) {
    const dayDate = new Date(weekStart);
    dayDate.setDate(weekStart.getDate() + t.weekday);
    const [sh, sm] = t.start_time.split(":").map((n) => parseInt(n, 10));
    const [eh, em] = t.end_time.split(":").map((n) => parseInt(n, 10));
    const s = new Date(dayDate);
    s.setHours(
      Number.isFinite(sh) ? sh : 0,
      Number.isFinite(sm) ? sm : 0,
      0,
      0,
    );
    const e = new Date(dayDate);
    e.setHours(
      Number.isFinite(eh) ? eh : 0,
      Number.isFinite(em) ? em : 0,
      0,
      0,
    );
    buckets[t.weekday].shifts.push({
      role: typicalShiftLabel,
      start: s.toLocaleTimeString(locale ?? undefined, {
        hour: "numeric",
        minute: "2-digit",
      }),
      end: e.toLocaleTimeString(locale ?? undefined, {
        hour: "numeric",
        minute: "2-digit",
      }),
      color: null,
      locationName: null,
    });
  }
  for (const b of buckets) {
    b.shifts.sort((a, b2) => a.start.localeCompare(b2.start));
  }
  return buckets;
}

async function hasPendingAccess(
  supabaseClient: SupabaseClient,
  userId: string,
): Promise<boolean> {
  try {
    const [{ data: pendingEmployments }, { data: pendingRequests }] =
      await Promise.all([
        supabaseClient
          .from("employment")
          .select("id")
          .eq("user_id", userId)
          .in("status", ["invited", "inactive", "pending"]),
        supabaseClient
          .from("employee_join_request")
          .select("id")
          .eq("requester_user_id", userId)
          .eq("status", "pending"),
      ]);

    return (
      (pendingEmployments?.length ?? 0) > 0 ||
      (pendingRequests?.length ?? 0) > 0
    );
  } catch (error) {
    console.error("[EmployeeHome] awaiting access lookup failed", error);
    return false;
  }
}
