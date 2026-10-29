"use strict";

const { UNAVAILABLE } = require("./config");

function asFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function isoFromUnix(value) {
  const unix = asFiniteNumber(value);
  if (unix === null) {
    return UNAVAILABLE;
  }
  const millis = unix > 1e12 ? unix : unix * 1000;
  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) {
    return UNAVAILABLE;
  }
  return date.toISOString();
}

function percentPair(remainingRaw) {
  const remaining = asFiniteNumber(remainingRaw);
  if (remaining === null || remaining < 0 || remaining > 100) {
    return {
      remainingPercent: 0,
      usedPercent: 100,
      unavailable: true,
    };
  }
  return {
    remainingPercent: remaining,
    usedPercent: Number((100 - remaining).toFixed(6)),
    unavailable: false,
  };
}

function quotaWindow(status, name, hidden) {
  if (hidden) {
    return {
      remainingPercent: 0,
      usedPercent: 100,
      resetsAt: UNAVAILABLE,
      resetsAtUnix: UNAVAILABLE,
      note: `${name} quota is hidden for this plan`,
    };
  }
  const percents = percentPair(status[`${name}QuotaRemainingPercent`]);
  const resetsAtUnixRaw = status[`${name}QuotaResetAtUnix`];
  const resetsAt = isoFromUnix(resetsAtUnixRaw);
  return {
    remainingPercent: percents.remainingPercent,
    usedPercent: percents.usedPercent,
    resetsAt,
    resetsAtUnix:
      percents.unavailable && resetsAt === UNAVAILABLE
        ? UNAVAILABLE
        : asFiniteNumber(resetsAtUnixRaw) ?? UNAVAILABLE,
    note: percents.unavailable ? `${name} quota was not returned` : null,
  };
}

function extraUsageBalance(status) {
  const micros = asFiniteNumber(status.overageBalanceMicros);
  if (micros === null) {
    return {
      micros: UNAVAILABLE,
      dollars: UNAVAILABLE,
      note: "No extra-usage / overage balance field was returned",
    };
  }
  return {
    micros,
    dollars: Number((micros / 1_000_000).toFixed(6)),
    note: null,
  };
}

function pick(object, keys) {
  const out = {};
  for (const key of keys) {
    if (object && Object.prototype.hasOwnProperty.call(object, key)) {
      out[key] = object[key];
    }
  }
  return out;
}

function normalizeSnapshot({ payload, auth, cliVersion, fetchedAt }) {
  const userStatus = payload && payload.userStatus;
  const planStatus = userStatus && userStatus.planStatus;
  const planInfo =
    (payload && payload.planInfo) ||
    (planStatus && planStatus.planInfo) ||
    {};

  const missingPlanStatus = !planStatus || typeof planStatus !== "object";
  const hideDailyQuota = Boolean(planInfo.hideDailyQuota);

  const daily = missingPlanStatus
    ? quotaWindow({}, "daily", false)
    : quotaWindow(planStatus, "daily", hideDailyQuota);
  const weekly = missingPlanStatus
    ? quotaWindow({}, "weekly", false)
    : quotaWindow(planStatus, "weekly", false);

  return {
    lastUpdated: fetchedAt,
    source: {
      cliCommand: "devin auth status",
      usageRpc: "SeatManagementService/GetUserStatus",
      verifiedAgainst: "Devin CLI footer / interactive /usage (daily+weekly remaining and reset)",
      printModeUsage: "devin -p /usage is not supported (Unknown command)",
    },
    cli: {
      version: cliVersion || UNAVAILABLE,
      loggedIn: auth && auth.loggedIn ? true : false,
      loginMethod: (auth && auth.loginMethod) || UNAVAILABLE,
      name: (auth && auth.name) || UNAVAILABLE,
      email: (auth && auth.email) || UNAVAILABLE,
      plan: (auth && auth.plan) || planInfo.planName || UNAVAILABLE,
      tier: (auth && auth.tier) || planInfo.teamsTier || UNAVAILABLE,
    },
    plan: {
      name: planInfo.planName || (auth && auth.plan) || UNAVAILABLE,
      billingStrategy: planInfo.billingStrategy || UNAVAILABLE,
      hideDailyQuota: Object.prototype.hasOwnProperty.call(planInfo, "hideDailyQuota")
        ? planInfo.hideDailyQuota
        : UNAVAILABLE,
      planStart: (planStatus && planStatus.planStart) || UNAVAILABLE,
      planEnd: (planStatus && planStatus.planEnd) || UNAVAILABLE,
    },
    dailySession: daily,
    daily,
    weekly,
    extraUsageBalance: missingPlanStatus
      ? extraUsageBalance({})
      : extraUsageBalance(planStatus),
    sessionAcu: {
      consumed: (planStatus && asFiniteNumber(planStatus.acuConsumed)) ?? UNAVAILABLE,
      limit: (planStatus && asFiniteNumber(planStatus.acuLimit)) ?? UNAVAILABLE,
      note:
        planStatus && (planStatus.acuConsumed != null || planStatus.acuLimit != null)
          ? null
          : "Account ACU total/limit were not present on this Pro quota response",
    },
    fieldsPresent: missingPlanStatus
      ? []
      : Object.keys(planStatus).filter((key) => key !== "planInfo"),
    planInfoSubset: pick(planInfo, [
      "planName",
      "teamsTier",
      "billingStrategy",
      "hideDailyQuota",
      "isDevin",
      "hasPaidFeatures",
    ]),
  };
}

function formatHuman(snapshot) {
  const fmt = (window) => {
    const remaining =
      window.remainingPercent === UNAVAILABLE ? UNAVAILABLE : `${window.remainingPercent}% remaining`;
    const used =
      window.usedPercent === UNAVAILABLE ? UNAVAILABLE : `${window.usedPercent}% used`;
    const reset = window.resetsAt === UNAVAILABLE ? UNAVAILABLE : window.resetsAt;
    return `${remaining}; ${used}; resets ${reset}`;
  };
  const extra =
    snapshot.extraUsageBalance.dollars === UNAVAILABLE
      ? UNAVAILABLE
      : `${snapshot.extraUsageBalance.dollars} USD`;
  const email = (snapshot.cli && snapshot.cli.email) || UNAVAILABLE;
  const name = snapshot.cli && snapshot.cli.name;
  return [
    `[${snapshot.lastUpdated}] plan=${snapshot.plan.name} strategy=${snapshot.plan.billingStrategy}`,
    `  account: ${email}${name && name !== UNAVAILABLE ? ` (${name})` : ""}`,
    `  dailySession: ${fmt(snapshot.dailySession)}`,
    `  weekly: ${fmt(snapshot.weekly)}`,
    `  extraUsageBalance: ${extra}`,
    `  sessionAcu: consumed=${snapshot.sessionAcu.consumed} limit=${snapshot.sessionAcu.limit}`,
  ].join("\n");
}

module.exports = { normalizeSnapshot, formatHuman, asFiniteNumber };
