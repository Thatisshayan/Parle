import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { t } from "./i18n";
import {
  APPROVED_PUBLIC_PROFILE_CONTENT_FIELDS,
  APPROVED_PUBLIC_PROFILE_EDIT_FIELDS,
  approvedProfileEditEligibility,
  approvedPublicContentRefreshPatch,
  approvedPublicProfileContent,
  approvedPublicProfileEditRecord,
  approvedPublicProfileSaveState,
  canRequestTutorLessonFromProfile,
  canTransitionApplicationStatus,
  documentBelongsToProfile,
  effectiveApplicationStatus,
  isPublishedTutorPublicProfile,
  isReviewSnapshotFresh,
  parseHourlyRateCents,
  proratedPriceCents,
  publicReviewSnapshot,
  resolvePayoutCountryStatus,
  safePublicTutorProfileFields,
  tutorApplicationGuidance,
  validateApprovedPublicProfileEdits,
  validateAvailabilityException,
  validateAvailabilityRule,
  validateCertificateFile,
  verifiedDocumentIds,
} from "../../functions/parle-marketplace.helper.ts";

const countries = [
  { country_name: "Canada", country_code: "CA", status: "supported" },
  { country_name: "Senegal", country_code: "SN", status: "waitlist" },
];

function validApprovedPublicProfileEdits() {
  return {
    headline: "French for real-life conversations",
    bio: "Practical speaking and writing lessons shaped around your goals.",
    spoken_languages: ["English", "French"],
    teaching_styles: ["patient", "structured"],
    hourly_rate_cents: 4250,
    intro_video_url: "https://youtu.be/new-video",
    intro_video_unlisted_confirmed: true,
    meeting_link: "https://meet.google.com/private-room",
  };
}

describe("Parle tutor marketplace rules", () => {
  it("stores hourly rates in cents and enforces the $10 to $150 bounds", () => {
    assert.equal(parseHourlyRateCents("10"), 1000);
    assert.equal(parseHourlyRateCents("42.50"), 4250);
    assert.equal(parseHourlyRateCents("150.00"), 15000);
    assert.equal(parseHourlyRateCents("9.99"), null);
    assert.equal(parseHourlyRateCents("150.01"), null);
    assert.equal(parseHourlyRateCents("10.001"), null);
  });

  it("allows approved fresh applications to edit public details but blocks other or stale reviews", () => {
    const updatedAt = "2026-10-12T12:00:00.000Z";
    const profile = { application_intent: "submitted", updated_at: updatedAt };
    const approvedReview = { status: "Approved", reviewed_profile_updated_at: updatedAt };
    assert.equal(approvedProfileEditEligibility(profile, approvedReview), null);
    assert.equal(approvedProfileEditEligibility(profile, { ...approvedReview, status: "Submitted" }), "APPLICATION_NOT_APPROVED");
    assert.equal(approvedProfileEditEligibility(profile, { ...approvedReview, status: "Needs changes" }), "APPLICATION_NOT_APPROVED");
    assert.equal(approvedProfileEditEligibility({ ...profile, application_intent: "draft" }, approvedReview), "APPLICATION_NOT_APPROVED");
    assert.equal(approvedProfileEditEligibility(profile, { ...approvedReview, reviewed_profile_updated_at: "2026-10-12T12:00:01.000Z" }), "APPLICATION_CHANGED");
  });

  it("reuses strict validators for every editable approved-profile field", () => {
    assert.equal(validateApprovedPublicProfileEdits(validApprovedPublicProfileEdits()).ok, true);
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ headline: " " }, "HEADLINE_REQUIRED"],
      [{ headline: "x".repeat(141) }, "HEADLINE_REQUIRED"],
      [{ bio: " " }, "BIO_REQUIRED"],
      [{ bio: "x".repeat(2001) }, "BIO_REQUIRED"],
      [{ spoken_languages: [] }, "LANGUAGES_REQUIRED"],
      [{ spoken_languages: ["Klingon"] }, "LANGUAGES_REQUIRED"],
      [{ teaching_styles: [] }, "STYLES_REQUIRED"],
      [{ teaching_styles: ["unlisted-style"] }, "STYLES_REQUIRED"],
      [{ hourly_rate_cents: 999 }, "RATE_INVALID"],
      [{ hourly_rate_cents: 15001 }, "RATE_INVALID"],
      [{ hourly_rate_cents: 1000.5 }, "RATE_INVALID"],
      [{ intro_video_url: "http://youtu.be/new-video" }, "VIDEO_INVALID"],
      [{ intro_video_unlisted_confirmed: false }, "VIDEO_INVALID"],
      [{ intro_video_url: "x".repeat(501) }, "VIDEO_INVALID"],
      [{ meeting_link: "https://teams.microsoft.com/l/meeting" }, "MEETING_LINK_INVALID"],
      [{ meeting_link: `https://meet.google.com/${"x".repeat(490)}` }, "MEETING_LINK_INVALID"],
    ];
    for (const [patch, code] of cases) {
      const result = validateApprovedPublicProfileEdits({ ...validApprovedPublicProfileEdits(), ...patch });
      assert.deepEqual(result, { ok: false, code });
    }
    const withoutVideo = validApprovedPublicProfileEdits();
    withoutVideo.intro_video_url = "";
    withoutVideo.intro_video_unlisted_confirmed = false;
    assert.equal(validateApprovedPublicProfileEdits(withoutVideo).ok, true);
  });

  it("shows correctly rounded 30, 45, and 60 minute prices", () => {
    assert.equal(proratedPriceCents(4250, 60), 4250);
    assert.equal(proratedPriceCents(4250, 45), 3188);
    assert.equal(proratedPriceCents(4250, 30), 2125);
    assert.equal(proratedPriceCents(1000, 30), 500);
    assert.equal(proratedPriceCents(999, 45), null);
  });

  it("distinguishes supported, waitlist, and unknown payout countries without blocking applications", () => {
    assert.equal(resolvePayoutCountryStatus("Canada", countries), "supported");
    assert.equal(resolvePayoutCountryStatus("SN", countries), "waitlist");
    assert.equal(resolvePayoutCountryStatus("Atlantis", countries), "waitlist");
    assert.equal(resolvePayoutCountryStatus("", countries), "waitlist");
  });

  it("enforces only the allowed tutor application status transitions", () => {
    assert.equal(canTransitionApplicationStatus("Draft", "Submitted"), true);
    assert.equal(canTransitionApplicationStatus("Submitted", "In review"), true);
    assert.equal(canTransitionApplicationStatus("In review", "Approved"), true);
    assert.equal(canTransitionApplicationStatus("In review", "Needs changes"), true);
    assert.equal(canTransitionApplicationStatus("Approved", "Suspended"), true);
    assert.equal(canTransitionApplicationStatus("Rejected", "Submitted"), false);
    assert.equal(canTransitionApplicationStatus("Suspended", "Approved"), false);
  });

  it("resubmits a revised Needs changes draft but never inherits an old approval", () => {
    const needsChanges = { status: "Needs changes", reviewed_revision: 2 };
    assert.equal(effectiveApplicationStatus({ application_intent: "submitted", submission_revision: 2 }, needsChanges), "Needs changes");
    assert.equal(effectiveApplicationStatus({ application_intent: "submitted", submission_revision: 3 }, needsChanges), "Submitted");
    assert.equal(effectiveApplicationStatus({ application_intent: "submitted", submission_revision: 99 }, { status: "Approved", reviewed_revision: 1 }), "Approved");
    assert.equal(effectiveApplicationStatus({ application_intent: "draft", submission_revision: 0 }, null), "Draft");
  });

  it("maps tutor application states to specific guidance and requires a confirmed listing for visibility", () => {
    assert.equal(tutorApplicationGuidance("Draft", false), "draft");
    assert.equal(tutorApplicationGuidance("Submitted", false), "awaiting_review");
    assert.equal(tutorApplicationGuidance("In review", false), "awaiting_review");
    assert.equal(tutorApplicationGuidance("Needs changes", false), "needs_changes");
    assert.equal(tutorApplicationGuidance("Approved", false), "approved_pending");
    assert.equal(tutorApplicationGuidance("Approved", true), "approved_published");
    assert.equal(tutorApplicationGuidance("Rejected", true), "rejected");
    assert.equal(tutorApplicationGuidance("Suspended", true), "suspended");
    assert.equal(tutorApplicationGuidance("unrecognized", true), "unknown");
  });

  it("accepts only an explicitly published preview and excludes private application fields from its public field set", () => {
    const privateApplication = {
      profile_id: "profile-private",
      display_name: "Tutor name",
      headline: "French tutor",
      bio: "Private application draft",
      spoken_languages: ["French"],
      teaching_styles: ["patient", "structured"],
      intro_video_unlisted_confirmed: true,
      meeting_link: "https://meet.google.com/private-room",
      owner_email: "owner@example.test",
      email: "tutor@example.test",
      tutor_email: "tutor@example.test",
      latest_comment: "Administrator note",
      admin_comment: "Review details",
      certificate_file_url: "private-certificate.pdf",
      certificate_document_id: "document-private",
      certificate_file_base64: "private-certificate-content",
      account_id: "account-private",
      user_id: "user-private",
      tutor_user_id: "tutor-private",
    };
    assert.equal(isPublishedTutorPublicProfile(privateApplication), false);
    const publicFields = safePublicTutorProfileFields(privateApplication);
    const publicPreview = { ...publicFields, is_published: true };
    assert.equal(isPublishedTutorPublicProfile(publicPreview), true);
    assert.deepEqual(publicFields.teaching_styles, ["patient", "structured"]);
    for (const privateField of ["meeting_link", "intro_video_unlisted_confirmed", "latest_comment", "admin_comment", "certificate_file_url", "certificate_document_id", "certificate_file_base64", "account_id", "email", "owner_email", "tutor_email", "user_id", "tutor_user_id"]) {
      assert.equal(Object.hasOwn(publicFields, privateField), false, `${privateField} must remain private`);
    }
    assert.equal(isPublishedTutorPublicProfile({ ...publicFields, is_published: false }), false);
  });

  it("saves only the approved profile allowlist and projects six public details", () => {
    const edits = validApprovedPublicProfileEdits();
    const saved = approvedPublicProfileEditRecord("profile-1", "user-1", edits);
    assert.ok(saved);
    assert.deepEqual(Object.keys(saved ?? {}), ["profile_id", "user_id", ...APPROVED_PUBLIC_PROFILE_EDIT_FIELDS]);
    for (const protectedField of [
      "status", "application_status", "reviewed_at", "latest_comment", "admin_comment",
      "specialties", "levels_taught", "verified_certificate_labels", "certificate_file_url",
      "photo_base64", "photo_mime_type", "is_published", "availability_json", "booking_schedule_json",
    ]) {
      const input = { ...edits, [protectedField]: "must not be accepted" };
      assert.deepEqual(validateApprovedPublicProfileEdits(input), { ok: false, code: "PROFILE_EDIT_FIELD_NOT_ALLOWED" }, protectedField);
      assert.equal(approvedPublicProfileEditRecord("profile-1", "user-1", input), null, `${protectedField} must not be saved`);
    }

    const publicContent = approvedPublicProfileContent(edits);
    assert.ok(publicContent);
    assert.deepEqual(Object.keys(publicContent ?? {}), [...APPROVED_PUBLIC_PROFILE_CONTENT_FIELDS]);
    assert.deepEqual(publicContent?.teaching_styles, ["patient", "structured"]);
    for (const privateField of ["meeting_link", "intro_video_unlisted_confirmed", "user_id", "profile_id", "owner_email"]) {
      assert.equal(Object.hasOwn(publicContent ?? {}, privateField), false, `${privateField} must not enter learner content`);
    }
  });

  it("shows the one-hour public refresh state only for a published pending profile", () => {
    assert.equal(approvedPublicProfileSaveState(false, true), "unpublished");
    assert.equal(approvedPublicProfileSaveState(true, true), "refresh_pending");
    assert.equal(approvedPublicProfileSaveState(true, false), "current");
    assert.match(t("profilePricing.saveSuccessPending"), /up to one hour/);
    assert.match(t("profilePricing.publicRefreshPending"), /up to one hour/);
  });

  it("shows only visible learner reviews and calculates ratings from visible reviews", () => {
    const review = (id: string, stars: number, isVisible?: boolean) => ({
      id,
      stars,
      profile_id: "profile-1",
      tutor_email: "tutor@example.test",
      ...(isVisible === undefined ? {} : { is_visible: isVisible }),
      created_at: "2026-10-01T12:00:00.000Z",
    });
    const reviews = [
      review("review-1", 5, true),
      review("review-2", 4, true),
      review("review-3", 5, true),
      review("hidden", 1, false),
      review("legacy-visible", 5),
    ];
    const belowThreshold = publicReviewSnapshot(
      [reviews[0], reviews[1], reviews[3]],
      [],
      "profile-1",
      "tutor@example.test",
    );
    assert.equal(belowThreshold.ratingSummary, null, "a hidden review cannot raise the visible-review threshold");
    assert.deepEqual(new Set(belowThreshold.reviews.map((item) => item.id)), new Set(["review-1", "review-2"]));

    const visible = publicReviewSnapshot(reviews, [], "profile-1", "tutor@example.test");
    assert.deepEqual(new Set(visible.reviews.map((item) => item.id)), new Set(["review-1", "review-2", "review-3", "legacy-visible"]));
    assert.deepEqual(visible.ratingSummary, { average: 4.8, count: 4 });
    assert.equal(visible.reviews.some((item) => "is_visible" in item), false, "moderation status stays private in the public review projection");

    const restored = publicReviewSnapshot(
      reviews.map((item) => item.id === "hidden" ? { ...item, is_visible: true } : item),
      [],
      "profile-1",
      "tutor@example.test",
    );
    assert.equal(restored.reviews.some((item) => item.id === "hidden"), true);
    assert.deepEqual(restored.ratingSummary, { average: 4, count: 5 });
  });

  it("keeps lesson-request actions unavailable in tutor preview mode", () => {
    assert.equal(canRequestTutorLessonFromProfile("learner"), true);
    assert.equal(canRequestTutorLessonFromProfile("tutor-preview"), false);
  });

  it("keeps the later-step note exact and tutor placeholder messages booking-dependent", () => {
    assert.equal(t("tutorDashboard.laterStep"), "Lesson history and earnings open in a later step.");
    assert.equal(t("tutorPlaceholder.studentsBody"), "This student list depends on confirmed lesson bookings, so pending requests do not add a learner here.");
    assert.equal(t("tutorPlaceholder.lessonsBody"), "Lesson history will be based on confirmed sessions after those lessons take place.");
    assert.equal(t("tutorPlaceholder.earningsBody"), "Earnings will be based on completed, paid lessons once the tutor payout system is available.");
  });

  it("checks certificate MIME, PDF signature, and the raw 512 KB limit", () => {
    const pdf = btoa("%PDF-1.7 demo certificate");
    assert.equal(validateCertificateFile({ mime_type: "application/pdf", content_base64: pdf, size_bytes: atob(pdf).length }).valid, true);
    assert.equal(validateCertificateFile({ mime_type: "image/jpeg", content_base64: pdf, size_bytes: atob(pdf).length }).reason, "FILE_SIGNATURE");
    assert.equal(validateCertificateFile({ mime_type: "application/pdf", content_base64: pdf, size_bytes: 512 * 1024 + 1 }).reason, "FILE_SIZE");
    assert.equal(validateCertificateFile({ mime_type: "application/octet-stream", content_base64: pdf, size_bytes: atob(pdf).length }).reason, "FILE_MIME");
    assert.equal(validateCertificateFile({ mime_type: "application/pdf", content_base64: "%%%", size_bytes: 3 }).valid, false);
  });

  it("matches certificate ids to their owning tutor profile before verification", () => {
    const docs = [{ id: "doc-a", profile_id: "profile-a" }, { id: "doc-b", profile_id: "profile-b" }];
    assert.equal(documentBelongsToProfile("doc-a", "profile-a", docs), true);
    assert.equal(documentBelongsToProfile("doc-b", "profile-a", docs), false);
    assert.deepEqual(verifiedDocumentIds(["doc-a", "doc-b", "doc-a", "missing"], "profile-a", docs), ["doc-a"]);
  });

  it("validates weekly local hours and one-date off or extra exceptions", () => {
    assert.equal(validateAvailabilityRule({ day_of_week: 1, start_local: "09:00", end_local: "17:00", time_zone: "America/Toronto" }), true);
    assert.equal(validateAvailabilityRule({ day_of_week: 8, start_local: "09:00", end_local: "17:00", time_zone: "America/Toronto" }), false);
    assert.equal(validateAvailabilityRule({ day_of_week: 2, start_local: "17:00", end_local: "09:00", time_zone: "America/Toronto" }), false);
    assert.equal(validateAvailabilityRule({ day_of_week: 2, start_local: "09:00", end_local: "17:00", time_zone: "Not/AZone" }), false);
    assert.equal(validateAvailabilityException({ date_local: "2026-12-24", kind: "off", time_zone: "America/Toronto" }), true);
    assert.equal(validateAvailabilityException({ date_local: "2026-02-30", kind: "off", time_zone: "America/Toronto" }), false);
    assert.equal(validateAvailabilityException({ date_local: "2026-12-24", kind: "extra", start_local: "10:00", end_local: "12:00", time_zone: "Europe/Paris" }), true);
    assert.equal(validateAvailabilityException({ date_local: "2026-12-24", kind: "extra", start_local: "12:00", end_local: "10:00", time_zone: "Europe/Paris" }), false);
  });

  it("detects when a tutor profile changed after an admin reviewed it", () => {
    const reviewedAt = "2026-10-12T00:00:00.000Z";
    assert.equal(isReviewSnapshotFresh(reviewedAt, reviewedAt), true);
    assert.equal(isReviewSnapshotFresh("2026-10-12T00:00:01.000Z", reviewedAt), false);
    assert.equal(isReviewSnapshotFresh(reviewedAt, ""), false);
  });

  it("limits approved profile refreshes to public content on an already published listing", () => {
    const listing = {
      is_published: true,
      status: "Approved",
      application_status: "Approved",
      headline: "Original headline",
      bio: "Original bio",
      spoken_languages: ["English"],
      teaching_styles: ["patient"],
      hourly_rate_cents: 4500,
      intro_video_url: "https://youtu.be/old-video",
      intro_video_unlisted_confirmed: false,
      specialties: ["conversation"],
      levels_taught: ["B1"],
      verified_certificate_labels: ["Teaching certificate"],
      meeting_link: "https://meet.google.com/private-room",
      availability_json: "{\\\"rules\\\":[]}",
      booking_schedule_json: "{\\\"settings\\\":{\\\"lesson_lengths_minutes\\\":[30]}}",
    };
    const original = structuredClone(listing);
    const edits = {
      headline: "French for the next step in your Canadian application",
      bio: "We will work through practical speaking and writing tasks.",
      spoken_languages: ["French", "English"],
      teaching_styles: ["structured", "confidence_building"],
      hourly_rate_cents: 6500,
      intro_video_url: "https://youtu.be/new-video",
      intro_video_unlisted_confirmed: true,
      meeting_link: "https://meet.google.com/new-private-room",
    };

    const patch = approvedPublicContentRefreshPatch(listing, edits);
    assert.deepEqual(Object.keys(patch ?? {}), [...APPROVED_PUBLIC_PROFILE_CONTENT_FIELDS]);
    assert.deepEqual(patch, {
      headline: edits.headline,
      bio: edits.bio,
      spoken_languages: edits.spoken_languages,
      teaching_styles: edits.teaching_styles,
      hourly_rate_cents: edits.hourly_rate_cents,
      intro_video_url: edits.intro_video_url,
    });
    for (const protectedField of [
      "is_published", "status", "application_status", "specialties", "levels_taught",
      "verified_certificate_labels", "meeting_link", "intro_video_unlisted_confirmed",
      "availability_json", "booking_schedule_json",
    ]) {
      assert.equal(Object.hasOwn(patch ?? {}, protectedField), false, `${protectedField} must not be patched`);
    }
    assert.deepEqual(listing, original, "building a refresh patch must not mutate the listing");
    assert.equal(approvedPublicContentRefreshPatch({ ...listing, is_published: false }, edits), null);
    assert.equal(approvedPublicContentRefreshPatch(listing, { ...edits, is_published: false }), null);
  });
});
