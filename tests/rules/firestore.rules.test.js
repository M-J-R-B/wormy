import { beforeAll, afterAll, beforeEach, test } from "vitest";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-wormlog",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const seed = () => env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), "users/alice/events/e1"), { type: "note" }));

test("owner can write and read their own data", async () => {
  const db = env.authenticatedContext("alice").firestore();
  await assertSucceeds(setDoc(doc(db, "users/alice/config/bin"), { name: "Worm bin" }));
  await assertSucceeds(getDoc(doc(db, "users/alice/config/bin")));
});

test("another user cannot read", async () => {
  await seed();
  await assertFails(getDoc(doc(env.authenticatedContext("bob").firestore(), "users/alice/events/e1")));
});

test("another user cannot write", async () => {
  await assertFails(setDoc(doc(env.authenticatedContext("bob").firestore(), "users/alice/events/e2"), { type: "note" }));
});

test("signed-out visitors get nothing", async () => {
  await seed();
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, "users/alice/events/e1")));
  await assertFails(setDoc(doc(db, "users/alice/events/e3"), { type: "note" }));
});

test("nothing outside users/{uid} is allowed", async () => {
  await assertFails(setDoc(doc(env.authenticatedContext("alice").firestore(), "public/x"), { a: 1 }));
});
