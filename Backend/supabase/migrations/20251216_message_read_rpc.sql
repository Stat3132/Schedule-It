-- RPC to allow recipients to mark direct messages as read without loosening RLS.
create or replace function public.mark_direct_messages_read(peer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.message
     set delivered_at = coalesce(delivered_at, now()),
         read_at = now()
   where recipient_id = auth.uid()
     and sender_id = peer_id
     and read_at is null;
end;
$$;

grant execute on function public.mark_direct_messages_read(uuid)
  to authenticated;
