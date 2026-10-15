// Runs INSIDE the owner's signed-in Buildy preview page (gstack `eval`). Returns rows and the owner's id, email and
// name as JSON. The access token is used only inside the page and never returned (Plan 1 rule).
// gstack wraps code that uses await in its own async function, so the result needs an explicit return.
return (async () => {
  const names = ["ParleCoachNote","ParleCompStatus","ParleIdentity","ParleProfile","ParlePublicLevelCheckRun","Subscriber","admin_audit_log","ai_message","ai_session","app_setting","availability_exception","availability_rule","booking","checkin","learner_profile","learner_task","milestone","mistake_log","placement_result","practice_report","prompt_item","question_item","roadmap","skill_estimate","topic_mastery","tutor_application_review","tutor_booking_settings","tutor_document","tutor_payout_country","tutor_profile","tutor_profile_public_edits","tutor_public_profile","tutor_review","tutor_review_reply","usage_counter","week_plan"];
  const token = localStorage.getItem("superdev_access_token") || "";
  const claims = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  const auth = { Authorization: "Bearer " + token, "X-App-ID": "yuircx1jlz5bpg1jbv2th" };
  const rows = {}, notes = {};
  for (const n of names) {
    rows[n] = [];
    for (let skip = 0; ; skip += 200) {
      const r = await fetch(`https://www.buildy.ai/api/apps/yuircx1jlz5bpg1jbv2th/entities/${n}?q=%7B%7D&limit=200&skip=${skip}`, { headers: auth });
      if (!r.ok) { notes[n] = r.status; break; }
      const page = await r.json().catch(() => null);
      if (!Array.isArray(page)) { notes[n] = "non-array"; break; }
      rows[n].push(...page);
      if (page.length < 200) break;
    }
  }
  const meta = claims.user_metadata || {};
  return JSON.stringify({ me: { id: claims.sub, email: claims.email, full_name: meta.full_name || meta.name || null }, rows, notes });
})()
