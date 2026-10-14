(async () => {
  const names = ["ParleCoachNote","ParleCompStatus","ParleIdentity","ParleProfile","ParlePublicLevelCheckRun","Subscriber","admin_audit_log","ai_message","ai_session","app_setting","availability_exception","availability_rule","booking","checkin","learner_profile","learner_task","milestone","mistake_log","placement_result","practice_report","prompt_item","question_item","roadmap","skill_estimate","topic_mastery","tutor_application_review","tutor_booking_settings","tutor_document","tutor_payout_country","tutor_profile","tutor_profile_public_edits","tutor_public_profile","tutor_review","tutor_review_reply","usage_counter","week_plan"];
  const auth = { Authorization: "Bearer " + localStorage.getItem("superdev_access_token"), "X-App-ID": "yuircx1jlz5bpg1jbv2th" };
  const out = [];
  for (const n of names) {
    let total = 0, status = 200;
    for (let skip = 0; ; skip += 200) {
      const r = await fetch(`https://www.buildy.ai/api/apps/yuircx1jlz5bpg1jbv2th/entities/${n}?q=%7B%7D&limit=200&skip=${skip}`, { headers: auth });
      if (!r.ok) { status = r.status; break; }
      const page = await r.json();
      total += page.length;
      if (page.length < 200) break;
    }
    out.push(`| owner | ${n} | ${status === 200 ? "yes" : "no"} | ${total} | - | ${status === 200 ? "" : status} |`);
  }
  return out.join("\n");
})()
