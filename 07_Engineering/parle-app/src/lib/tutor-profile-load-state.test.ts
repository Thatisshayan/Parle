import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";
import { TutorProfileFailureCard } from "../pages/LearnerTutorProfile.tsx";
import { t } from "./i18n";
import {
  tutorProfileFailurePresentation,
  tutorProfileLoadFailureKind,
  tutorProfileLoadFailureKindFromError,
} from "./tutor-profile-load-state";

async function renderFailure(error: unknown, tutorPreview = false): Promise<string> {
  const kind = await tutorProfileLoadFailureKindFromError(error);
  return renderToStaticMarkup(
    createElement(
      StaticRouter,
      { location: "/learner/tutors/profile-1" },
      createElement(TutorProfileFailureCard, {
        kind,
        tutorPreview,
        onRetry: () => undefined,
      }),
    ),
  );
}

describe("learner tutor profile load states", () => {
  it("shows the exact not-found page for an unknown tutor id", async () => {
    // The installed function client turns the exact 404 envelope into this Error and drops its status.
    const serverReply = { error: "NOT_FOUND", code: "NOT_FOUND" };
    const lookupError = new Error(`API request failed: ${serverReply.error}`);
    assert.equal(lookupError.message, "API request failed: NOT_FOUND");
    const kind = await tutorProfileLoadFailureKindFromError(lookupError);
    const presentation = tutorProfileFailurePresentation(kind);
    const markup = await renderFailure(lookupError);

    assert.equal(kind, "not_found");
    assert.equal(t(presentation.titleKey), "Tutor not found");
    assert.equal(t(presentation.bodyKey), "This tutor profile is not available. It may have been removed or is not public yet.");
    assert.equal(t(presentation.actionKey), "Browse tutors");
    assert.equal(presentation.destination, "/learner/tutors");
    assert.match(markup, /Tutor not found/);
    assert.match(markup, /This tutor profile is not available\. It may have been removed or is not public yet\./);
    assert.match(markup, /href="\/learner\/tutors"[^>]*>.*Browse tutors/s);
    assert.doesNotMatch(markup, /Check your connection|Try again/);
  });

  it("requires a matching NOT_FOUND body when an HTTP status is available", async () => {
    const matching404 = {
      status: 404,
      body: JSON.stringify({ error: "NOT_FOUND", code: "NOT_FOUND" }),
    };
    const unrelated404 = {
      status: 404,
      body: JSON.stringify({ error: "ROUTE_NOT_FOUND", code: "ROUTE_NOT_FOUND" }),
    };
    const unqualified404 = { status: 404 };
    const notFoundOn503 = {
      status: 503,
      body: JSON.stringify({ error: "NOT_FOUND", code: "NOT_FOUND" }),
    };
    const response404 = {
      message: "The function returned a non-2xx response",
      context: new Response(JSON.stringify({ error: "NOT_FOUND", code: "NOT_FOUND" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    };
    const response503 = {
      message: "The function returned a non-2xx response",
      context: new Response(JSON.stringify({ error: "NOT_FOUND", code: "NOT_FOUND" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    };

    assert.equal(await tutorProfileLoadFailureKindFromError(matching404), "not_found");
    assert.equal(await tutorProfileLoadFailureKindFromError(unrelated404), "error");
    assert.equal(await tutorProfileLoadFailureKindFromError(unqualified404), "error");
    assert.equal(await tutorProfileLoadFailureKindFromError(notFoundOn503), "error");
    assert.equal(await tutorProfileLoadFailureKindFromError(response404), "not_found");
    assert.equal(await tutorProfileLoadFailureKindFromError(response503), "error");
  });

  it("renders an unpublished tutor exactly like an unknown id", async () => {
    // The public lookup deliberately returns the same NOT_FOUND envelope for both cases.
    const unknownTutorResponse = { error: "NOT_FOUND", code: "NOT_FOUND" };
    const unpublishedTutorResponse = {
      data: { status: "error", error: "NOT_FOUND", code: "NOT_FOUND" },
    };

    assert.equal(tutorProfileLoadFailureKind(unpublishedTutorResponse), "not_found");
    assert.equal(await renderFailure(unpublishedTutorResponse), await renderFailure(unknownTutorResponse));
  });

  it("shows connection guidance and a retry button for network and server failures", async () => {
    const networkFailure = new TypeError("Failed to fetch");
    const serverFailure = {
      message: "The function returned a non-2xx response",
      context: new Response(JSON.stringify({ error: "SERVICE_UNAVAILABLE", code: "SERVICE_UNAVAILABLE" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    };
    const genericMessageFailure = new Error("The function returned a non-2xx response: NOT_FOUND");
    const clientServiceFailure = new Error("API request failed: SERVICE_UNAVAILABLE");
    const markup = await renderFailure(networkFailure);
    const serverMarkup = await renderFailure(serverFailure);
    const kind = await tutorProfileLoadFailureKindFromError(networkFailure);
    const presentation = tutorProfileFailurePresentation(kind);

    assert.equal(kind, "error");
    assert.equal(await tutorProfileLoadFailureKindFromError(serverFailure), "error");
    assert.equal(await tutorProfileLoadFailureKindFromError(genericMessageFailure), "error");
    assert.equal(await tutorProfileLoadFailureKindFromError(clientServiceFailure), "error");
    assert.equal(t(presentation.bodyKey), "Check your connection and try again. The tutor’s profile has not changed.");
    assert.equal(t(presentation.actionKey), "Try again");
    assert.equal(presentation.destination, null);
    assert.match(markup, /Tutor profile could not be loaded/);
    assert.match(markup, /Check your connection and try again\. The tutor’s profile has not changed\./);
    assert.match(markup, /<button[^>]*type="button"[^>]*>.*Try again/s);
    assert.match(serverMarkup, /Tutor profile could not be loaded/);
    assert.match(serverMarkup, /Check your connection and try again\. The tutor’s profile has not changed\./);
    assert.match(serverMarkup, /<button[^>]*type="button"[^>]*>.*Try again/s);
    assert.doesNotMatch(markup, /Tutor not found|Browse tutors/);
    assert.doesNotMatch(serverMarkup, /Tutor not found|Browse tutors/);
  });

  it("keeps the narrow-screen failure card and actions within the content width", async () => {
    const markup = await renderFailure({ error: "NOT_FOUND", code: "NOT_FOUND" });

    assert.match(markup, /class="[^"]*w-full min-w-0[^"]*p-5[^"]*sm:p-10/);
    assert.match(markup, /class="[^"]*max-w-md break-words/);
    assert.match(markup, /class="[^"]*w-full justify-center sm:w-auto/);
  });

  it("preserves the tutor-preview return path and private-preview wording", async () => {
    const markup = await renderFailure({ error: "NOT_FOUND", code: "NOT_FOUND" }, true);

    assert.match(markup, /This tutor profile is not available to learners\./);
    assert.match(markup, /href="\/tutor"[^>]*>.*Back to tutor dashboard/s);
  });
});
