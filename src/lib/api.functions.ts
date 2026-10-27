import { createServerFn } from "@tanstack/react-start";
import {
  MINING_HOURS, POWER_LEVELS, REFERRAL_BONUS, MIN_WITHDRAW, ORAI_JETTON, GRAM_ADDRESS,
  RECEIVE_WALLET, PAYOUT_WALLET, WITHDRAW_FEE_GRAM, ADMIN_USERNAMES, NFT_COLLECTION_ADDRESS, NFT_PRICE_GRAM, NFT_TIERS, nftBenefits,
  sessionReward, levelForHoldings, dailyOrai, MARKET_MAX_AGE, withdrawalDebit,
} from "./config";

type Auth = { initData: string };
const auth = (i: Auth) => {
  if (typeof i?.initData !== "string" || !i.initData) throw new Error("Unauthorized");
  return i;
};

async function ctx(initData: string) {
  const { verifyInitData } = await import("./tg-auth.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const v = await verifyInitData(initData);
  return { ...v, db: supabaseAdmin };
}

async function loadUser(db: any, id: number) {
  const { data, error } = await db.from("orai_tg_users").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data;
}

export const bootstrap = createServerFn({ method: "POST" })
  .inputValidator(auth)
  .handler(async ({ data }) => {
    const { user, startParam, db } = await ctx(data.initData);
    const { data: existing } = await db.from("orai_tg_users").select("id").eq("id", user.id).maybeSingle();
    const profile = {
      id: user.id, username: user.username ?? null, first_name: user.first_name ?? null,
      photo_url: user.photo_url ?? null, language_code: user.language_code ?? null,
    };
    if (!existing) {
      const ref = startParam?.startsWith("ref_") ? Number(startParam.slice(4)) : null;
      const referred_by = ref && ref !== user.id ? ref : null;
      await db.from("orai_tg_users").insert({ ...profile, referred_by });

    } else {
      await db.from("orai_tg_users").update(profile).eq("id", user.id);
    }
    const { reconcilePayouts } = await import("./payout-queue.server");
    await reconcilePayouts(db, user.id);
    await syncPower(db, user.id);
    const [me, tasks, done, refs, wd] = await Promise.all([
      loadUser(db, user.id),
      db.from("orai_tasks").select("*").eq("active", true).order("sort"),
      db.from("orai_task_completions").select("task_id").eq("user_id", user.id),
      db.from("orai_tg_users").select("id, first_name, username, referral_signup_paid, referral_wallet_paid, referral_mining_paid, mining_claim_count").eq("referred_by", user.id).limit(100),
      db.from("orai_withdrawals").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    ]);
    return {
      me,
      isAdmin: ADMIN_USERNAMES.includes((user.username ?? "").toLowerCase()),
      tasks: tasks.data ?? [],
      done: (done.data ?? []).map((d: any) => d.task_id as string),
      referrals: refs.data ?? [],
      withdrawals: wd.data ?? [],
    };
  });

export const startMining = createServerFn({ method: "POST" })
  .inputValidator(auth)
  .handler(async ({ data }) => {
    const { user, db } = await ctx(data.initData);
    const me = await loadUser(db, user.id);
    if (me.mining_started_at) throw new Error("Already mining");
    const synced = await syncPower(db, user.id);
    const now = new Date().toISOString();
    await db.from("orai_tg_users").update({ mining_started_at: now, mining_settled_at: now, mining_pending: 0 }).eq("id", user.id);
    return { mining_started_at: now, mining_settled_at: now, mining_pending: 0, mining_rate_daily: synced.mining_rate_daily };
  });

export const claimMining = createServerFn({ method: "POST" })
  .inputValidator(auth)
  .handler(async ({ data }) => {
    const { user, db } = await ctx(data.initData);
    const me = await loadUser(db, user.id);
    if (!me.mining_started_at) throw new Error("Not mining");
    const { data: result, error } = await db.rpc("orange_mining_claim", { p_user_id: user.id });
    if (error) throw new Error(error.message);
    await syncPower(db, user.id);
    return { ...await loadUser(db, user.id) };
  });

export const completeTask = createServerFn({ method: "POST" })
  .inputValidator((i: Auth & { taskId: string }) => ({ ...auth(i), taskId: String(i.taskId) }))
  .handler(async ({ data }) => {
    const { user, db } = await ctx(data.initData);
    const { data: task } = await db.from("orai_tasks").select("*").eq("id", data.taskId).single();
    if (!task) throw new Error("Task not found");
    // Real verification per task kind.
    const token = process.env["TELEGRAM_BOT_TOKEN"];
    const match = String(task.link).match(/(?:^|\/\/)t\.me\/([A-Za-z0-9_]{5,})/);
    const chat = task.chat_id || (match && !String(task.link).includes("?") ? `@${match[1]}` : null);
    if (chat && token) {
      const r = await fetch(`https://api.telegram.org/bot${token}/getChatMember`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chat, user_id: user.id }),
      });
      const j = (await r.json()) as any;
      if (!j.ok || ["left", "kicked"].includes(j.result?.status)) throw new Error("TASK_NOT_VERIFIED");
    }
    if (task.kind === "ston") {
      const meNow = await loadUser(db, user.id);
      if (!meNow.wallet_address) throw new Error("TASK_NOT_VERIFIED");
      const held = await oraiHoldings(meNow.wallet_address).catch(() => 0);
      if (!(held > 0)) throw new Error("TASK_NOT_VERIFIED");
    }
    const { error } = await db.from("orai_task_completions").insert({ user_id: user.id, task_id: task.id });
    if (error) throw new Error("Already completed");
    const me = await loadUser(db, user.id);
    const { data: owned } = await db.from("orai_nfts").select("tier").eq("user_id", user.id);
    const balance = Number(me.balance) + Number(task.reward) * nftBenefits((owned ?? []).map((n: any) => n.tier)).tasks;
    await db.from("orai_tg_users").update({ balance }).eq("id", user.id);
    const synced = await syncPower(db, user.id);
    return { balance, power_level: synced.power_level };
  });

export const upgradePower = createServerFn({ method: "POST" })
  .inputValidator((i: Auth & { level: number }) => ({ ...auth(i), level: Number(i.level) }))
  .handler(async ({ data }) => {
    const { user, db } = await ctx(data.initData);
    // Compatibility endpoint: holding coins grants power; never debit a balance.
    return syncPower(db, user.id);
  });

async function oraiHoldings(owner: string) {
  const url = `https://toncenter.com/api/v3/jetton/wallets?owner_address=${encodeURIComponent(owner)}&jetton_address=${ORAI_JETTON}&limit=1`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Blockchain lookup failed [${r.status}]`);
  const j = (await r.json()) as { jetton_wallets?: { balance: string }[] };
  return Number(j.jetton_wallets?.[0]?.balance ?? 0) / 1e9;
}

export const setWallet = createServerFn({ method: "POST" })
  .inputValidator((i: Auth & { address: string | null }) => ({ ...auth(i), address: i.address ? String(i.address).slice(0, 80) : null }))
  .handler(async ({ data }) => {
    const { user, db } = await ctx(data.initData);
    await db.from("orai_tg_users").update({ wallet_address: data.address, wallet_verified: false }).eq("id", user.id);
    return { ok: true };
  });

/** Grants the power level covered by ORAI the user actually holds in their connected wallet. */
export const verifyHoldings = createServerFn({ method: "POST" })
  .inputValidator(auth)
  .handler(async ({ data }) => {
    const { user, db } = await ctx(data.initData);
    return syncPower(db, user.id);
  });

/** Polls the receive wallet for an on-chain payment carrying a specific comment. */
async function findPayment(tag: string, minValue: number, attempts = 8, used = new Set<unknown>(), account: string = RECEIVE_WALLET) {
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(`https://toncenter.com/api/v3/transactions?account=${account}&limit=100&sort=desc`);
      if (r.ok) {
        const j = (await r.json()) as any;
        const tx = (j.transactions ?? []).find((t: any) =>
          !used.has(t.hash) && !t.description?.aborted && t.in_msg?.message_content?.decoded?.comment === tag && Number(t.in_msg?.value ?? 0) >= minValue);
        if (tx) return tx;
      }
    } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 4000));
  }
  return null;
}

export const requestWithdraw = createServerFn({ method: "POST" })
  .inputValidator((i: Auth & { amount: number }) => ({ ...auth(i), amount: Number(i.amount) }))
  .handler(async ({ data }) => {
    const { user, db } = await ctx(data.initData);
    if (!Number.isFinite(data.amount) || data.amount < MIN_WITHDRAW || data.amount > 1e12) throw new Error(`Minimum is ${MIN_WITHDRAW} ORAI`);
    const me = await loadUser(db, user.id);
    if (!me.wallet_address || !me.wallet_verified) throw new Error("Verify wallet ownership first");
    if (Number(me.balance) < withdrawalDebit(data.amount)) throw new Error("Not enough ORAI including fee");
    const { data: pending } = await db.from("orai_withdrawals").select("id").eq("user_id", user.id).in("status", ["pending", "submitted"]).limit(1);
    if (pending?.length) throw new Error("Your earlier withdrawal is still being confirmed");
    const { payoutPreflight } = await import("./payout.server");
    await payoutPreflight(data.amount, true);
    const { data: withdrawalId, error } = await db.rpc("orange_paid_withdrawal", { p_user_id: user.id, p_amount: data.amount, p_address: me.wallet_address });
    if (error) throw new Error(error.message);
    const { processPayouts } = await import("./payout-queue.server");
    await processPayouts(db).catch((e: unknown) => console.error("Payout deferred", e));
    await syncPower(db, user.id).catch((e: unknown) => console.error("Power sync deferred", e));
    const { data: saved } = await db.from("orai_withdrawals").select("status").eq("id", withdrawalId).single();
    return { id: withdrawalId, balance: (await loadUser(db, user.id)).balance, status: saved?.status ?? "pending" };

  });


async function gramBalance(address: string) {
  const r = await fetch(`https://toncenter.com/api/v3/account?address=${encodeURIComponent(address)}`);
  if (!r.ok) throw new Error(`Blockchain lookup failed [${r.status}]`);
  const j = (await r.json()) as any;
  return Number(j.balance ?? 0) / 1e9;
}

async function syncPower(db: any, id: number) {
  const me = await loadUser(db, id);
  const { marketSnapshot } = await import("./market.server");
  const market = await marketSnapshot(db);
  let external = 0, gramHeld = 0;
  try {
    if (me.wallet_verified && me.wallet_address) {
      external = await oraiHoldings(me.wallet_address);
      gramHeld = await gramBalance(me.wallet_address);
    }
  }
  catch { return { ...me, market, holdings: null, syncUnavailable: true }; }
  if (!market.orai.priceUsd || market.stale) return { ...me, market, holdings: Number(me.balance) + external, syncUnavailable: true };
  // GRAM held in the verified wallet counts toward holdings at its USD value, expressed in ORAI.
  const gramAsOrai = market.gram?.priceUsd > 0 ? gramHeld * market.gram.priceUsd / market.orai.priceUsd : 0;
  const holdings = Number(me.balance) + external + gramAsOrai;
  const level = levelForHoldings(holdings, market.orai.priceUsd);
  const pro = me.subscribed_until && new Date(me.subscribed_until).getTime() > Date.now();
  const { data: owned } = await db.from("orai_nfts").select("tier").eq("user_id", id);
  const perks = nftBenefits((owned ?? []).map((n: any) => n.tier));
  await db.from("orai_tg_users").update({ referral_rate: perks.referralRate }).eq("id", id);
  const rate = dailyOrai(level, market.orai.priceUsd) * (pro ? 2 : 1) * perks.mining;
  const { error } = await db.rpc("orange_sync_power", { p_user_id: id, p_level: level, p_rate: rate });
  if (error) throw new Error(error.message);
  return { ...await loadUser(db, id), market, holdings, syncUnavailable: false };
}
export const getMarket = createServerFn({ method: "POST" }).inputValidator(auth).handler(async ({ data }) => {
  const { db } = await ctx(data.initData);
  const { marketSnapshot } = await import("./market.server");
  return marketSnapshot(db);
});
export const refreshMarket = createServerFn({ method: "POST" }).inputValidator(auth).handler(async ({ data }) => {
  const { db } = await adminCtx(data.initData);
  const { marketSnapshot } = await import("./market.server");
  return marketSnapshot(db, true);
});

export const walletBalances = createServerFn({ method: "POST" })
  .inputValidator((i: Auth & { address: string }) => ({ ...auth(i), address: String(i.address).slice(0, 80) }))
  .handler(async ({ data }) => {
    await ctx(data.initData);
    const [orai, gram] = await Promise.all([
      oraiHoldings(data.address),
      gramBalance(data.address),
    ]);
    return { orai, gram };
  });

export const SUB_PRICE_GRAM = 5;

/** Confirms a Pro payment on-chain (comment pro:<userId> to the receive wallet) and extends Pro by 30 days. */
export const verifySubscription = createServerFn({ method: "POST" })
  .inputValidator(auth)
  .handler(async ({ data }) => {
    const { RECEIVE_WALLET } = await import("./config");
    const { user, db } = await ctx(data.initData);
    const r = await fetch(`https://toncenter.com/api/v3/transactions?account=${RECEIVE_WALLET}&limit=100&sort=desc`);
    if (!r.ok) throw new Error(`Blockchain lookup failed [${r.status}]`);
    const j = (await r.json()) as any;
    const tag = `pro:${user.id}`;
    const tx = (j.transactions ?? []).find((t: any) =>
      t.in_msg?.message_content?.decoded?.comment === tag && Number(t.in_msg?.value ?? 0) >= SUB_PRICE_GRAM * 1e9);
    if (!tx) throw new Error("Payment not found yet, try again in a minute");
    const me = await loadUser(db, user.id);
    const txTime = Number(tx.now) * 1000;
    const base = Math.max(Date.now(), me.subscribed_until ? new Date(me.subscribed_until).getTime() : 0);
    // only credit a payment made after the current period was purchased
    if (me.subscribed_until && txTime < new Date(me.subscribed_until).getTime() - 30 * 86400_000) throw new Error("Payment already used");
    const until = new Date(base + 30 * 86400_000).toISOString();
    await db.from("orai_tg_users").update({ subscribed_until: until }).eq("id", user.id);
    return { subscribed_until: until };
  });

// ============= Admin =============

async function adminCtx(initData: string) {
  const c = await ctx(initData);
  if (!ADMIN_USERNAMES.includes((c.user.username ?? "").toLowerCase())) throw new Error("Forbidden");
  return c;
}

export const adminOverview = createServerFn({ method: "POST" })
  .inputValidator(auth)
  .handler(async ({ data }) => {
    const { db } = await adminCtx(data.initData);
    const [users, withdrawals, tasks, nfts, apps] = await Promise.all([
      db.from("orai_tg_users").select("id", { count: "exact", head: true }),
      db.from("orai_withdrawals").select("*").order("created_at", { ascending: false }).limit(50),
      db.from("orai_tasks").select("*").order("sort"),
      db.from("orai_nfts").select("id", { count: "exact", head: true }),
      db.from("orai_task_apps").select("*").order("created_at"),
    ]);
    let totalBalance = 0;
    for (let from = 0; ; from += 1000) {
      const { data: page } = await db.from("orai_tg_users").select("balance").order("id").range(from, from + 999);
      for (const u of page ?? []) totalBalance += Number(u.balance);
      if (!page || page.length < 1000) break;
    }
    return {
      users: users.count ?? 0,
      totalBalance,
      withdrawals: withdrawals.data ?? [],
      tasks: tasks.data ?? [],
      nfts: nfts.count ?? 0,
      apps: apps.data ?? [],
    };
  });

export const adminAddApp = createServerFn({ method: "POST" })
  .inputValidator((i: Auth & { name: string; image: string; category?: string }) => {
    const name = String(i.name ?? "").trim().slice(0, 60);
    const image = String(i.image ?? "");
    const category = ["ours", "partners", "others"].includes(String(i.category)) ? String(i.category) : "ours";
    if (!name || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > 120000) throw new Error("Invalid application name or image");
    return { ...auth(i), name, image, category };
  }).handler(async ({ data }) => {
    const { db } = await adminCtx(data.initData);
    const { error } = await db.from("orai_task_apps").insert({ name: data.name, image: data.image, category: data.category } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminAddTask = createServerFn({ method: "POST" })
  .inputValidator((i: Auth & { title: string; link: string; appId: string }) => {
    const title = String(i.title ?? "").trim().slice(0, 120);
    const link = String(i.link ?? "").trim();
    if (!title || link.length > 300 || new URL(link).protocol !== "https:") throw new Error("Invalid task name or link");
    return { ...auth(i), title, link, appId: String(i.appId) };
  }).handler(async ({ data }) => {
    const { db } = await adminCtx(data.initData);
    const { data: app, error: appError } = await db.from("orai_task_apps").select("*").eq("id", data.appId).single();
    if (appError || !app) throw new Error("Select an application first");
    const priv = data.link.match(/t\.me\/c\/(\d+)/);
    const kind = /ston\.fi/i.test(data.link) ? "ston" : priv ? "channel" : "link";
    const { translateTitle } = await import("./translate.server");
    const title_i18n = await translateTitle(data.title);
    const { error } = await db.from("orai_tasks").insert({ title: data.title, link: data.link, reward: 0, kind, chat_id: priv ? `-100${priv[1]}` : null, title_i18n,
      app_id: app.id, app_name: app.name, app_image: app.image, image_url: app.image, app_category: (app as any).category ?? "ours" } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminToggleTask = createServerFn({ method: "POST" })
  .inputValidator((i: Auth & { taskId: string; active: boolean }) => ({ ...auth(i), taskId: String(i.taskId), active: !!i.active }))
  .handler(async ({ data }) => {
    const { db } = await adminCtx(data.initData);
    const { error } = await db.from("orai_tasks").update({ active: data.active }).eq("id", data.taskId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============= NFT =============

/** Buys an NFT tier: verifies the GRAM payment to the receive wallet, records it, activates perks, then tries to mint. */
export const buyNft = createServerFn({ method: "POST" })
  .inputValidator((i: Auth & { tier: number }) => ({ ...auth(i), tier: Number(i.tier) }))
  .handler(async ({ data }) => {
    const tier = NFT_TIERS.find(t => t.tier === data.tier);
    if (!tier) throw new Error("Invalid NFT tier");
    const { user, db } = await ctx(data.initData);
    const me = await loadUser(db, user.id);
    if (!me.wallet_address) throw new Error("Connect your wallet first");
    const { data: usedRows } = await db.from("orai_nfts").select("tx_hash");
    const usedSet = new Set((usedRows ?? []).map((r: any) => r.tx_hash).filter(Boolean));
    const tx = await findPayment(`nft:${user.id}:${tier.tier}`, Math.round(tier.price * 1e9), 8, usedSet);
    if (!tx) throw new Error("Payment not found yet, try again in a minute");
    const { count } = await db.from("orai_nfts").select("id", { count: "exact", head: true });
    const itemIndex = count ?? 0;
    const { error } = await db.from("orai_nfts").insert({ user_id: user.id, item_index: itemIndex, price_gram: tier.price, tx_hash: tx.hash, tier: tier.tier, mint_status: "pending" });
    if (error) throw new Error("This payment was already used");
    await syncPower(db, user.id);
    try {
      const { getgemsMint } = await import("./getgems.server");
      await getgemsMint(`nft-${tx.hash}`.slice(0, 100), me.wallet_address, tier.tier);
      await db.from("orai_nfts").update({ mint_status: "submitted" }).eq("tx_hash", tx.hash);
    } catch (e) { console.error("NFT mint deferred:", e); }
    return { itemIndex, tier: tier.tier };
  });

export const myNfts = createServerFn({ method: "POST" })
  .inputValidator(auth)
  .handler(async ({ data }) => {
    const { user, db } = await ctx(data.initData);
    const { data: rows } = await db.from("orai_nfts").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    return { nfts: rows ?? [], collection: NFT_COLLECTION_ADDRESS, price: NFT_PRICE_GRAM };
  });

export const walletChallenge = createServerFn({ method: "POST" }).inputValidator(auth).handler(async ({ data }) => {
  const { user, db } = await ctx(data.initData);
  const nonce = `${Date.now()}:${crypto.randomUUID()}`;
  const { error } = await db.from("orai_tg_users").update({ wallet_nonce: nonce }).eq("id", user.id);
  if (error) throw new Error(error.message);
  return { nonce };
});
export const proveWallet = createServerFn({ method: "POST" }).inputValidator((i: Auth & { address: string; proof: { timestamp: number; domain: { lengthBytes: number; value: string }; payload: string; signature: string } }) => ({ ...auth(i), address: i.address, proof: i.proof })).handler(async ({ data }) => {
  const { user, db } = await ctx(data.initData);
  const me = await loadUser(db, user.id);
  if (!me.wallet_nonce || Date.now() - Number(me.wallet_nonce.split(":")[0]) > 300000) throw new Error("Request a new wallet verification");
  const { getRequest } = await import("@tanstack/react-start/server");
  const { verifyWalletProof } = await import("./wallet-proof.server");
  const address = await verifyWalletProof(data.address, data.proof, me.wallet_nonce, [new URL(getRequest().url).host, "orangeorai.vercel.app", "botkey-telegram-bridge.lovable.app"]);
  const { data: other } = await db.from("orai_tg_users").select("id").eq("wallet_address", address).eq("wallet_verified", true).neq("id", user.id).limit(1);
  if (other?.length) throw new Error("Wallet already linked to another account");
  const { error } = await db.from("orai_tg_users").update({ wallet_address: address, wallet_verified: true, wallet_nonce: null }).eq("id", user.id).eq("wallet_nonce", me.wallet_nonce).select("id").single();
  if (error) throw new Error(error.message);
  return syncPower(db, user.id);
});

export const checkWithdrawal = createServerFn({ method: "POST" }).inputValidator((i: Auth & { amount: number }) => ({ ...auth(i), amount: Number(i.amount) })).handler(async ({ data }) => {
  const { user, db } = await ctx(data.initData);
  const me = await loadUser(db, user.id);
  if (!Number.isFinite(data.amount) || data.amount < MIN_WITHDRAW || data.amount > 1e12 || withdrawalDebit(data.amount) > Number(me.balance)) throw new Error("Not enough ORAI including fee or below minimum withdrawal");
  const { payoutPreflight } = await import("./payout.server");
  if (!me.wallet_address || !me.wallet_verified) throw new Error("Verify wallet ownership first");
  const { data: pending } = await db.from("orai_withdrawals").select("id").eq("user_id", user.id).in("status", ["pending", "submitted"]).limit(1);
  if (pending?.length) throw new Error("Your earlier withdrawal is still being confirmed");
  await payoutPreflight(data.amount, true);
  return { ok: true };
});

/** Admin: retries minting every paid-but-unminted NFT. */
export const adminMintPending = createServerFn({ method: "POST" })
  .inputValidator((i: Auth) => auth(i))
  .handler(async ({ data }) => {
    const { db } = await adminCtx(data.initData);
    const { data: rows } = await db.from("orai_nfts").select("id,item_index,user_id,tier,tx_hash").eq("mint_status", "pending").order("item_index");
    const { getgemsMint } = await import("./getgems.server");
    let minted = 0;
    for (const n of rows ?? []) {
      const { data: u } = await db.from("orai_tg_users").select("wallet_address").eq("id", n.user_id).single();
      if (!u?.wallet_address) continue;
      await getgemsMint(`nft-${n.tx_hash ?? n.id}`.slice(0, 100), u.wallet_address, n.tier ?? 1);
      await db.from("orai_nfts").update({ mint_status: "submitted" }).eq("id", n.id);
      minted++;
    }
    return { minted, pending: (rows?.length ?? 0) - minted };
  });

export const spinDaily = createServerFn({ method: "POST" }).inputValidator(auth).handler(async ({ data }) => {
  const { user, db } = await ctx(data.initData);
  const { data: result, error } = await db.rpc("orange_spin_daily", { p_user_id: user.id });
  if (error) throw new Error(error.message);
  return result as { reward: number; balance: number; nextSpinAt: string };
});
export const gameStatus = createServerFn({ method: "POST" }).inputValidator(auth).handler(async ({ data }) => {
  const { user, db } = await ctx(data.initData);
  const { data: row, error } = await db.from("orai_game_spins").select("last_spun_at").eq("user_id", user.id).maybeSingle();
  if (error) throw new Error(error.message);
  return { nextSpinAt: row?.last_spun_at ? new Date(new Date(row.last_spun_at).getTime() + 86400000).toISOString() : null };
});
