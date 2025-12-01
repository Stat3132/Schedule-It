"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Cropper, { type Area, type MediaSize } from "react-easy-crop";
import NextImage from "next/image";
import "react-easy-crop/react-easy-crop.css";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Camera, Loader2, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const PROFILE_PHOTO_BUCKET =
  process.env.NEXT_PUBLIC_SUPABASE_PROFILE_BUCKET ?? "profile-photos";
const MAX_PROFILE_PHOTO_BYTES = 4 * 1024 * 1024; // 4 MB
const CROPPED_OUTPUT_SIZE = 640;
const CROPPED_MIME_TYPE = "image/jpeg";
const CROPPED_FILE_EXT = "jpg";

type ProfileEditorCardProps = {
  isDark?: boolean;
};

type InitialProfileState = {
  displayName: string;
  description: string;
  photoUrl: string | null;
};

export default function ProfileEditorCard({ isDark = false }: ProfileEditorCardProps) {
  const supabase = createClientComponentClient();
  const { t } = useI18n();

  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [initialState, setInitialState] = useState<InitialProfileState>({
    displayName: "",
    description: "",
    photoUrl: null,
  });

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoadingProfile(true);
      setErrorMessage(null);
      setStatusMessage(null);

      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      if (cancelled) return;
      setUserId(uid);

      if (!uid) {
        setLoadingProfile(false);
        return;
      }

      const { data: profileRow, error } = await supabase
        .from("profiles")
        .select("display_name, profile_title, photo_url")
        .eq("id", uid)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error("[ProfileEditorCard] profile load failed", error);
      }

      const nextDisplay = (profileRow?.display_name as string | null) ?? "";
      const nextDescription = (profileRow?.profile_title as string | null) ?? "";
      const nextPhoto = (profileRow?.photo_url as string | null) ?? null;

      setDisplayName(nextDisplay);
      setDescription(nextDescription);
      setPhotoUrl(nextPhoto);
      setInitialState({
        displayName: nextDisplay,
        description: nextDescription,
        photoUrl: nextPhoto,
      });
      setLoadingProfile(false);
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    setErrorMessage(null);
    setStatusMessage(null);
  }, [displayName, description, photoUrl]);

  const trimmedDisplayName = displayName.trim();
  const trimmedDescription = description.trim();

  const isDirty = useMemo(() => {
    return (
      trimmedDisplayName !== initialState.displayName.trim() ||
      trimmedDescription !== initialState.description.trim() ||
      (photoUrl ?? null) !== (initialState.photoUrl ?? null)
    );
  }, [trimmedDisplayName, trimmedDescription, photoUrl, initialState]);

  const cardBgClass = isDark ? "bg-gray-800 text-white" : "bg-white text-gray-900";
  const mutedTextClass = isDark ? "text-gray-400" : "text-gray-600";
  const inputClass = isDark
    ? "mt-1 w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder:text-gray-500"
    : "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500";
  const textAreaClass = `${inputClass} min-h-[120px] resize-none`;

  const handleReset = () => {
    setDisplayName(initialState.displayName);
    setDescription(initialState.description);
    setPhotoUrl(initialState.photoUrl);
    setErrorMessage(null);
    setStatusMessage(null);
  };

  const handleFileInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorMessage(t("settings.profile.photoInvalid"));
      event.target.value = "";
      return;
    }

    if (file.size > MAX_PROFILE_PHOTO_BYTES) {
      setErrorMessage(t("settings.profile.photoTooLarge"));
      event.target.value = "";
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
      setCropImageSrc(dataUrl);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setCropModalOpen(true);
    } catch (error) {
      console.error("[ProfileEditorCard] file read failed", error);
      setErrorMessage(t("settings.profile.photoError"));
    } finally {
      event.target.value = "";
    }
  };

  const handleCancelCrop = () => {
    setCropModalOpen(false);
    setCropImageSrc(null);
    setCroppedAreaPixels(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSaveProfile = async () => {
    if (!userId) {
      setErrorMessage(t("settings.profile.noUser"));
      return;
    }

    if (!trimmedDisplayName) {
      setErrorMessage(t("settings.profile.requiredName"));
      return;
    }

    setSavingProfile(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const payload = {
        id: userId,
        display_name: trimmedDisplayName,
        profile_title: trimmedDescription || null,
        photo_url: photoUrl ?? null,
        profile_customized: true,
      };

      const { error } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" });

      if (error) {
        throw error;
      }

      try {
        await supabase.auth.updateUser({
          data: {
            display_name: trimmedDisplayName,
            profile_title: trimmedDescription || null,
            photo_url: photoUrl ?? null,
            profile_customized: true,
          },
        });
      } catch (metadataError) {
        console.warn("[ProfileEditorCard] metadata update failed", metadataError);
      }

      setInitialState({
        displayName: trimmedDisplayName,
        description: trimmedDescription,
        photoUrl: photoUrl ?? null,
      });
      setStatusMessage(t("settings.profile.success"));
    } catch (error) {
      console.error("[ProfileEditorCard] profile update failed", error);
      setErrorMessage(t("settings.profile.error"));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleApplyCrop = async () => {
    if (!userId || !cropImageSrc || !croppedAreaPixels) {
      setErrorMessage(t("settings.profile.photoError"));
      return;
    }

    setUploadingPhoto(true);
    setErrorMessage(null);

    try {
      const blob = await getCroppedBlob(
        cropImageSrc,
        croppedAreaPixels,
        CROPPED_OUTPUT_SIZE,
        CROPPED_MIME_TYPE,
      );
      const filePath = `${userId}/${Date.now()}.${CROPPED_FILE_EXT}`;

      const uploadResult = await supabase.storage
        .from(PROFILE_PHOTO_BUCKET)
        .upload(filePath, blob, {
          cacheControl: "3600",
          upsert: true,
          contentType: CROPPED_MIME_TYPE,
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

      setPhotoUrl(publicUrlData.publicUrl);
      setCropModalOpen(false);
      setCropImageSrc(null);
      setCroppedAreaPixels(null);
    } catch (error) {
      console.error("[ProfileEditorCard] crop/upload failed", error);
      setErrorMessage(t("settings.profile.photoError"));
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemovePhoto = () => {
    setPhotoUrl(null);
  };

  const handleMediaLoaded = (media: MediaSize) => {
    setCroppedAreaPixels({
      x: 0,
      y: 0,
      width: media.width,
      height: media.height,
    });
  };

  const renderStatus = () => {
    if (errorMessage) {
      return (
        <div className="rounded-md border border-rose-400/70 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
          {errorMessage}
        </div>
      );
    }

    if (statusMessage) {
      return (
        <div className="rounded-md border border-emerald-400/70 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">
          {statusMessage}
        </div>
      );
    }

    return null;
  };

  const disabledUpload = uploadingPhoto || savingProfile || loadingProfile;
  const disableApplyCrop = uploadingPhoto || !croppedAreaPixels;

  return (
    <section className={`${cardBgClass} rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{t("settings.profile.heading")}</h2>
          <p className={`text-sm ${mutedTextClass}`}>
            {t("settings.profile.subheading")}
          </p>
        </div>
      </div>

      {renderStatus()}

      {loadingProfile ? (
        <div className={`flex items-center gap-2 text-sm ${mutedTextClass}`}>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{t("shared.state.loading")}</span>
        </div>
      ) : !userId ? (
        <p className={`text-sm ${mutedTextClass}`}>{t("settings.profile.noUser")}</p>
      ) : (
        <>
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="flex flex-col items-center gap-3 lg:w-1/3">
              <div className="relative h-28 w-28 overflow-hidden rounded-full border border-gray-300 bg-gray-100 dark:border-gray-700 dark:bg-gray-900">
                {photoUrl ? (
                  <NextImage
                    src={photoUrl}
                    alt={t("settings.profile.photoLabel")}
                    fill
                    sizes="112px"
                    className="object-cover"
                    priority={false}
                  />
                ) : (
                  <div className={`flex h-full w-full flex-col items-center justify-center text-xs ${mutedTextClass}`}>
                    <Camera className="h-5 w-5" />
                    <span>{t("settings.profile.photoLabel")}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 text-sm">
                <label
                  className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-1.5 font-medium transition ${
                    disabledUpload
                      ? "cursor-not-allowed opacity-60"
                      : "cursor-pointer bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {uploadingPhoto ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                  <span>
                    {uploadingPhoto
                      ? t("settings.profile.photoUploading")
                      : t("settings.profile.upload")}
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={handleFileInput}
                    disabled={disabledUpload}
                  />
                </label>
                {photoUrl && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="text-xs font-semibold text-rose-500 transition hover:text-rose-600 dark:text-rose-300"
                    disabled={savingProfile}
                  >
                    {t("settings.profile.remove")}
                  </button>
                )}
              </div>
              <p className={`text-center text-xs ${mutedTextClass}`}>
                {t("settings.profile.photoHint")}
              </p>
            </div>

            <div className="flex-1 space-y-4">
              <div>
                <label className={`text-sm font-medium ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                  {t("settings.profile.displayName")}
                </label>
                <input
                  className={inputClass}
                  value={displayName}
                  placeholder={t("settings.profile.displayNamePlaceholder")}
                  onChange={(event) => setDisplayName(event.target.value)}
                  maxLength={80}
                />
              </div>
              <div>
                <label className={`text-sm font-medium ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                  {t("settings.profile.description")}
                </label>
                <textarea
                  className={textAreaClass}
                  value={description}
                  placeholder={t("settings.profile.descriptionPlaceholder")}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={220}
                />
                <p className={`mt-1 text-xs ${mutedTextClass}`}>
                  {trimmedDescription.length}/220
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 text-sm text-gray-500 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
            <div />
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleReset}
                disabled={!isDirty || savingProfile}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                  !isDirty || savingProfile
                    ? "cursor-not-allowed border-gray-300 text-gray-400 dark:border-gray-700 dark:text-gray-500"
                    : "border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                {t("settings.profile.reset")}
              </button>
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={!isDirty || savingProfile || uploadingPhoto}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition ${
                  !isDirty || savingProfile || uploadingPhoto
                    ? "cursor-not-allowed bg-blue-400/60 text-white"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                {savingProfile ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {t("settings.profile.save")}
              </button>
            </div>
          </div>
        </>
      )}

      {cropModalOpen && cropImageSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div
            className={`relative w-full max-w-2xl rounded-2xl border p-6 shadow-xl ${
              isDark
                ? "border-gray-700 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-900"
            }`}
          >
            <button
              type="button"
              aria-label="Close"
              className="absolute right-4 top-4 rounded-full border border-transparent p-1 text-gray-400 transition hover:text-gray-700 dark:hover:text-gray-200"
              onClick={handleCancelCrop}
              disabled={uploadingPhoto}
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="text-lg font-semibold">{t("settings.profile.cropper.title")}</h3>
            <p className={`mt-2 text-sm ${mutedTextClass}`}>
              {t("settings.profile.cropper.guide")}
            </p>
            <div className="mt-3 h-80 w-full overflow-hidden rounded-xl bg-black/60">
              <div className="relative h-full w-full">
                <Cropper
                  image={cropImageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  onMediaLoaded={handleMediaLoaded}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_, croppedPixels) => setCroppedAreaPixels(croppedPixels)}
                  objectFit="cover"
                  showGrid
                />
                <div
                  className="pointer-events-none absolute inset-10 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
                  aria-hidden="true"
                />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <label className="text-sm font-medium">
                {t("settings.profile.cropper.zoomLabel")}
              </label>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
                className="flex-1 accent-blue-600"
                disabled={uploadingPhoto}
              />
            </div>
            {!croppedAreaPixels && (
              <p className="mt-2 text-xs text-amber-500">
                {t("settings.profile.cropper.applyDisabled")}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCancelCrop}
                disabled={uploadingPhoto}
                className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                {t("settings.profile.cropper.cancel")}
              </button>
              <button
                type="button"
                onClick={handleApplyCrop}
                disabled={disableApplyCrop}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold ${
                  disableApplyCrop ? "bg-blue-400/60" : "bg-blue-600 hover:bg-blue-700"
                } text-white`}
              >
                {uploadingPhoto ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {t("settings.profile.cropper.apply")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

async function getCroppedBlob(
  imageSrc: string,
  croppedPixels: Area,
  outputSize: number,
  mimeType: string,
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Unable to create canvas context");
  }

  const { x, y, width, height } = croppedPixels;

  ctx.drawImage(
    image,
    x,
    y,
    width,
    height,
    0,
    0,
    outputSize,
    outputSize,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Canvas is empty"));
          return;
        }
        resolve(blob);
      },
      mimeType,
      0.92,
    );
  });
}

function createImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = src;
  });
}
