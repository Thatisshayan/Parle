import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADMIN_GUARDED_ACTIONS,
  ADMIN_SCREEN_ACTIONS,
  dispatchWithAdminAccess,
} from "../../functions/parle-admin-access.helper.ts";
import { AdminActionError, type AdminActor } from "../../functions/parle-admin-settings.helper.ts";
import { requiresServerAdminAuthorization } from "./admin-route-access";

const ADMIN: AdminActor = {
  id: "admin-1",
  email: "admin@parle.test",
  full_name: "Parle Admin",
  role: "administrator",
};

const SCREEN_ACTIONS = [
  "admin_authorize",
  "admin_get_settings",
  "admin_save_settings",
  "admin_list_audit",
  "admin_list_users",
  "admin_content_coverage",
  "admin_get_metrics",
  "admin_list_reported_content",
  "admin_resolve_practice_report",
  "admin_manage_reviews",
  "admin_get_content_item",
  "admin_save_content_item",
  "admin_generate_content_drafts",
  "admin_get_demo_bank",
  "admin_update_demo_bank_content",
  "audit_question_bank",
  "admin_set_premium_comp",
] as const;

function callerFor(identityRole: "learner" | "tutor"): AdminActor & { parle_role: "learner" | "tutor"; requested_role: string } {
  return {
    id: `${identityRole}-user-1`,
    email: `${identityRole}@parle.test`,
    role: "user",
    // The Parle identity is context only. Built-in User.role remains the authorization source.
    parle_role: identityRole,
    requested_role: "administrator",
  };
}

function isAdminRequired(error: unknown): boolean {
  return error instanceof AdminActionError
    && error.code === "ADMIN_REQUIRED"
    && error.status === 403;
}

describe("Parle administrator action-dispatch access gate", () => {
  it("covers each protected administrator screen action plus settings initialization", () => {
    assert.deepEqual(ADMIN_SCREEN_ACTIONS, SCREEN_ACTIONS);
    assert.deepEqual(ADMIN_GUARDED_ACTIONS, [...SCREEN_ACTIONS, "admin_initialize"]);
  });

  it("server-checks the question-bank repair route before showing its content", () => {
    assert.equal(requiresServerAdminAuthorization("/admin/question-bank-repair"), true);
    assert.equal(requiresServerAdminAuthorization("/admin/settings"), true);
    assert.equal(requiresServerAdminAuthorization("/admin/users"), true);
    assert.equal(requiresServerAdminAuthorization("/admin/content"), true);
    assert.equal(requiresServerAdminAuthorization("/admin/metrics"), true);
    assert.equal(requiresServerAdminAuthorization("/admin/reported-content"), true);
    assert.equal(requiresServerAdminAuthorization("/admin/reviews"), true);
    assert.equal(requiresServerAdminAuthorization("/admin"), false);
  });

  it("rejects direct learner and tutor calls before protected handlers or data operations", async () => {
    for (const identityRole of ["learner", "tutor"] as const) {
      const caller = callerFor(identityRole);
      assert.equal(caller.role, "user");

      for (const action of ADMIN_GUARDED_ACTIONS) {
        let handlerCalls = 0;
        const dataOperations: string[] = [];

        await assert.rejects(
          () => dispatchWithAdminAccess(action, caller, async () => {
            handlerCalls += 1;
            dataOperations.push("protected settings, audit, User, ParleIdentity, or ParleProfile access");
            return { status: "complete" };
          }),
          isAdminRequired,
          `${identityRole} should be refused for ${action}`,
        );

        assert.equal(handlerCalls, 0, `${identityRole} entered ${action}`);
        assert.deepEqual(dataOperations, [], `${identityRole} caused data access for ${action}`);
      }
    }
  });

  it("blocks question-bank reads, repair saves, and AI audit callbacks for learners and tutors", async () => {
    const bankActions = [
      "admin_get_demo_bank",
      "admin_update_demo_bank_content",
      "audit_question_bank",
    ] as const;

    for (const identityRole of ["learner", "tutor"] as const) {
      const caller = callerFor(identityRole);
      const operations = { bankReads: 0, bankWrites: 0, aiCalls: 0 };

      for (const action of bankActions) {
        await assert.rejects(
          () => dispatchWithAdminAccess(action, caller, async () => {
            if (action === "admin_get_demo_bank") operations.bankReads += 1;
            else if (action === "admin_update_demo_bank_content") operations.bankWrites += 1;
            else operations.aiCalls += 1;
            return { status: "complete" };
          }),
          isAdminRequired,
          `${identityRole} should be refused for ${action}`,
        );
      }

      assert.deepEqual(operations, { bankReads: 0, bankWrites: 0, aiCalls: 0 });
    }
  });

  it("allows the server-authenticated administrator through every guarded action", async () => {
    let handlerCalls = 0;

    for (const action of ADMIN_GUARDED_ACTIONS) {
      const result = await dispatchWithAdminAccess(action, ADMIN, async () => {
        handlerCalls += 1;
        return { action, status: "complete" };
      });
      assert.deepEqual(result, { action, status: "complete" });
    }

    assert.equal(handlerCalls, ADMIN_GUARDED_ACTIONS.length);
  });

  it("returns an authorized screen-check result only after the administrator gate passes", async () => {
    const result = await dispatchWithAdminAccess("admin_authorize", ADMIN, async () => ({
      status: "complete",
      authorized: true,
    }));
    assert.deepEqual(result, { status: "complete", authorized: true });

    for (const identityRole of ["learner", "tutor"] as const) {
      let handlerCalls = 0;
      await assert.rejects(
        () => dispatchWithAdminAccess("admin_authorize", callerFor(identityRole), async () => {
          handlerCalls += 1;
          return { status: "complete", authorized: true };
        }),
        isAdminRequired,
      );
      assert.equal(handlerCalls, 0);
    }
  });

  it("does not apply the screen gate to unrelated learner or administrator actions", async () => {
    const learnerResult = await dispatchWithAdminAccess("learner_list_tutors", callerFor("learner"), async () => ({
      status: "complete",
      tutors: [],
    }));
    const otherAdminResult = await dispatchWithAdminAccess("admin_list_applications", ADMIN, async () => ({
      status: "complete",
      changed: true,
    }));

    assert.deepEqual(learnerResult, { status: "complete", tutors: [] });
    assert.deepEqual(otherAdminResult, { status: "complete", changed: true });
  });
});
