-- Rollcall: "Wrong name? Undo" for court check-in.
-- Paste into Supabase → rollcall project → SQL Editor → Run.
create or replace function public.court_undo(p_code text, p_device text, p_player uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare cfg public.settings; v_sid uuid; v_n int;
begin
  select * into cfg from public.settings where court_code = p_code;
  if not found then raise exception 'This QR code is no longer valid.'; end if;
  select id into v_sid from public.sessions where owner = cfg.owner and date = (now() at time zone 'Asia/Phnom_Penh')::date;
  if v_sid is null then raise exception 'Nothing to undo.'; end if;
  delete from public.attendance a
  where a.session_id = v_sid and a.player_id = p_player and a.self_checked
    and a.checked_in_at > now() - interval '2 minutes'
    and exists (select 1 from public.checkin_devices d where d.session_id = v_sid and d.device_id = p_device and d.player_id = p_player);
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Undo only works for 2 minutes after checking in. Ask the coach to fix it.'; end if;
  delete from public.checkin_devices where session_id = v_sid and device_id = p_device;
  delete from public.device_players where owner = cfg.owner and device_id = p_device and player_id = p_player and first_session = v_sid;
  return true;
end $$;
revoke all on function public.court_undo(text, text, uuid) from public;
grant execute on function public.court_undo(text, text, uuid) to anon, authenticated;
