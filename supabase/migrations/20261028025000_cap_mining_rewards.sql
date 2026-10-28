-- Prevent mining self-amplification and cap any already accumulated runaway values.
CREATE OR REPLACE FUNCTION public.orange_sync_power(p_user_id bigint, p_level integer, p_rate numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  u public.orai_tg_users;
  ts timestamptz := now();
  elapsed numeric;
  safe_rate numeric := least(greatest(coalesce(p_rate, 0), 0), 100);
BEGIN
  SELECT * INTO u FROM public.orai_tg_users WHERE id = p_user_id FOR UPDATE;
  IF u.mining_started_at IS NOT NULL THEN
    elapsed := greatest(0, extract(epoch FROM (least(ts, u.mining_started_at + interval '2 hours') - coalesce(u.mining_settled_at, u.mining_started_at))));
    UPDATE public.orai_tg_users
      SET mining_pending = least(greatest(coalesce(mining_pending, 0) + elapsed / 86400 * least(greatest(coalesce(mining_rate_daily, 0), 0), 100), 0), 100 * 2 / 24),
          mining_settled_at = ts, power_level = greatest(coalesce(p_level, 0), 0), mining_rate_daily = safe_rate
      WHERE id = p_user_id;
  ELSE
    UPDATE public.orai_tg_users SET power_level = greatest(coalesce(p_level, 0), 0), mining_rate_daily = safe_rate WHERE id = p_user_id;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.orange_sync_power(bigint, integer, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orange_sync_power(bigint, integer, numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.orange_mining_claim(p_user_id bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  u public.orai_tg_users; r public.orai_tg_users; elapsed numeric; reward numeric; ts timestamptz := now();
BEGIN
  SELECT * INTO u FROM public.orai_tg_users WHERE id = p_user_id FOR UPDATE;
  IF u.mining_started_at IS NULL THEN RAISE EXCEPTION 'Not mining'; END IF;
  IF ts < u.mining_started_at + interval '2 hours' THEN RAISE EXCEPTION 'Mining not finished'; END IF;
  elapsed := greatest(0, extract(epoch FROM (least(ts, u.mining_started_at + interval '2 hours') - coalesce(u.mining_settled_at, u.mining_started_at))));
  reward := least(100 * 2 / 24, greatest(0, coalesce(u.mining_pending, 0)) + elapsed / 86400 * least(greatest(coalesce(u.mining_rate_daily, 0), 0), 100));
  UPDATE public.orai_tg_users SET balance = balance + reward, mining_started_at = ts, mining_settled_at = ts, mining_pending = 0, mining_rate_daily = least(greatest(coalesce(mining_rate_daily, 0), 0), 100) WHERE id = p_user_id;
  IF u.referred_by IS NOT NULL AND u.referred_by <> p_user_id THEN
    SELECT * INTO r FROM public.orai_tg_users WHERE id = u.referred_by;
    UPDATE public.orai_tg_users SET balance = balance + reward * coalesce(r.referral_rate, 0.10), referral_earned = referral_earned + reward * coalesce(r.referral_rate, 0.10) WHERE id = u.referred_by;
  END IF;
  RETURN jsonb_build_object('balance', u.balance + reward, 'mining_started_at', ts);
END $function$;
REVOKE ALL ON FUNCTION public.orange_mining_claim(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orange_mining_claim(bigint) TO service_role;

UPDATE public.orai_tg_users
SET mining_rate_daily = least(greatest(coalesce(mining_rate_daily, 0), 0), 100),
    mining_pending = least(greatest(coalesce(mining_pending, 0), 0), 100 * 2 / 24)
WHERE mining_rate_daily > 100 OR mining_pending > 100 * 2 / 24;
