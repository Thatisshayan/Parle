import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applySavedDecisionToApplications,
  applySavedDecisionToSelected,
  countApplicationsByStatus,
  saveAndApplyAdminDecision,
  type ApplicationStatus,
  type SavedDecisionProjection,
} from "./admin-applications-state";

interface TestApplication {
  id: string;
  status: ApplicationStatus;
  latest_comment: string;
  last_decision_at: string;
  notification_state: string;
  display_name: string;
}

interface TestSelection {
  profile: { id: string };
  status: ApplicationStatus;
  review: { status: ApplicationStatus; latest_comment: string; notification_state: string };
}

interface TestState {
  applications: TestApplication[];
  selected: TestSelection | null;
}

const SAVED_APPROVAL: SavedDecisionProjection = {
  profile_id: "profile-1",
  status: "Approved",
  last_decision_at: "2026-10-14T05:00:00.000Z",
  latest_comment: "Approved after the certificate review.",
  notification_state: "sent",
};

function initialState(): TestState {
  return {
    applications: [
      {
        id: "profile-1",
        status: "In review",
        latest_comment: "Please clarify your teaching experience.",
        last_decision_at: "2026-10-12T14:00:00.000Z",
        notification_state: "queued",
        display_name: "Camille Laurent",
      },
      {
        id: "profile-2",
        status: "Approved",
        latest_comment: "Previously approved.",
        last_decision_at: "2026-10-11T14:00:00.000Z",
        notification_state: "sent",
        display_name: "Noah Martin",
      },
    ],
    selected: {
      profile: { id: "profile-1" },
      status: "In review",
      review: {
        status: "In review",
        latest_comment: "Please clarify your teaching experience.",
        notification_state: "queued",
      },
    },
  };
}

describe("administrator application decision state", () => {
  it("updates the matching row and open review from the saved approval", async () => {
    let state = initialState();
    const result = await saveAndApplyAdminDecision(
      async () => ({ saved_decision: SAVED_APPROVAL }),
      "profile-1",
      (decision) => {
        state = {
          applications: applySavedDecisionToApplications(state.applications, decision),
          selected: applySavedDecisionToSelected(state.selected, decision),
        };
        return state;
      },
    );

    assert.equal(result.decision.status, "Approved");
    assert.equal(state.applications[0].status, "Approved");
    assert.equal(state.applications[0].latest_comment, SAVED_APPROVAL.latest_comment);
    assert.equal(state.applications[0].last_decision_at, SAVED_APPROVAL.last_decision_at);
    assert.equal(state.applications[0].notification_state, "sent");
    assert.equal(state.applications[0].display_name, "Camille Laurent");
    assert.equal(state.selected?.profile.id, "profile-1");
    assert.equal(state.selected?.status, "Approved");
    assert.equal(state.selected?.review.status, "Approved");
    assert.equal(state.selected?.review.latest_comment, SAVED_APPROVAL.latest_comment);
    assert.equal(state.selected?.review.notification_state, "sent");
    assert.equal(state.applications[1].status, "Approved", "unrelated rows remain unchanged");
    assert.equal(state.applications[1].last_decision_at, "2026-10-11T14:00:00.000Z");
  });

  it("leaves the row and selected review unchanged when the save fails", async () => {
    let state = initialState();
    const originalState = state;
    const originalValues = structuredClone(state);
    let successHandlerCalled = false;

    await assert.rejects(
      saveAndApplyAdminDecision(
        async () => { throw new Error("REVIEW_SAVE_FAILED"); },
        "profile-1",
        (decision) => {
          successHandlerCalled = true;
          state = {
            applications: applySavedDecisionToApplications(state.applications, decision),
            selected: applySavedDecisionToSelected(state.selected, decision),
          };
        },
      ),
      /REVIEW_SAVE_FAILED/,
    );

    assert.equal(successHandlerCalled, false);
    assert.strictEqual(state, originalState);
    assert.deepEqual(state, originalValues);
    assert.equal(state.applications[0].status, "In review");
    assert.equal(state.applications[0].last_decision_at, "2026-10-12T14:00:00.000Z");
    assert.equal(state.selected?.status, "In review");
    assert.equal(state.selected?.review.status, "In review");
  });

  it("recalculates status filter totals immediately after a saved decision", () => {
    const original = initialState().applications;
    const before = countApplicationsByStatus(original);
    const updated = applySavedDecisionToApplications(original, SAVED_APPROVAL);
    const after = countApplicationsByStatus(updated);

    assert.equal(before.all, 2);
    assert.equal(before["In review"], 1);
    assert.equal(before.Approved, 1);
    assert.equal(after.all, 2);
    assert.equal(after["In review"], 0);
    assert.equal(after.Approved, 2);
    assert.equal(after["Needs changes"], 0);
  });
});
