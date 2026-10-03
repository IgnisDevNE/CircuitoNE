import assert from "node:assert/strict";
import { test } from "node:test";
import { checkHomologationSsr } from "../scripts/homologation-ssr.mjs";
const env = {
  PATH: "/usr/local/bin:/usr/bin",
  SUPABASE_PROJECT_REF: "odphoxozclrshqjgwbqk",
  SUPABASE_URL: "https://odphoxozclrshqjgwbqk.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic",
  SUPABASE_ACCESS_TOKEN: "private-pat",
  PGPASSWORD: "private-db",
  GITHUB_TOKEN: "private-github",
  NODE_OPTIONS: "--require private-file",
  HOME: "/private/home",
};
const identities = [1, 5].map((n) => ({
  id: "01000000-0000-4000-8000-" + String(n).padStart(12, "0"),
  name: "Sintética " + n,
  access_token: "synthetic-access-" + n,
  refresh_token: "synthetic-refresh-" + n,
}));
test("compiled SSR worker receives only public configuration and sessions through stdin", async () => {
  const calls = [];
  await checkHomologationSsr(env, identities, (exe, args, options) => {
    calls.push({ exe, args, options });
    return { status: 0, stdout: args.includes("--worker") ? "SSR_AUTH_OK\n" : "", stderr: "" };
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].args, ["node_modules/@react-router/dev/bin.cjs", "build"]);
  assert.ok(calls[1].args.includes("--worker"));
  for (const call of calls) {
    assert.deepEqual(Object.keys(call.options.env).sort(), [
      "CIRCUITONE_RUNTIME",
      "DEMO_MODE",
      "NODE_ENV",
      "PATH",
      "SUPABASE_PROJECT_REF",
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_URL",
    ]);
    assert.equal(call.options.env.CIRCUITONE_RUNTIME, "development");
    assert.equal(call.options.env.DEMO_MODE, "true");
    assert.ok(!JSON.stringify(call.args).includes("synthetic-access"));
  }
  assert.equal(calls[0].options.input, undefined);
  assert.deepEqual(JSON.parse(calls[1].options.input), identities);
});
test("wrong project and non-reserved identities are rejected before build or token transfer", async () => {
  let calls = 0;
  const run = () => {
    calls++;
    throw Error("must not execute");
  };
  await assert.rejects(
    checkHomologationSsr({ ...env, SUPABASE_PROJECT_REF: "ukyoyrmebwadmuzkswdw" }, identities, run),
  );
  await assert.rejects(
    checkHomologationSsr({ ...env, SUPABASE_URL: "https://attacker.invalid" }, identities, run),
  );
  await assert.rejects(
    checkHomologationSsr(env, [{ ...identities[0], id: "unreserved" }, identities[1]], run),
  );
  assert.equal(calls, 0);
});
test("failed build does not start the worker and never relays diagnostic secrets", async () => {
  let calls = 0;
  await assert.rejects(
    checkHomologationSsr(env, identities, () => {
      calls++;
      return { status: 1, stdout: "private-token", stderr: "private-token" };
    }),
    (error) => error.message === "SSR build failed",
  );
  assert.equal(calls, 1);
});
test("worker failure or forged receipt blocks homologation without exposing sessions", async () => {
  for (const result of [
    { status: 1, stdout: "private-token", stderr: "private-token" },
    { status: 0, stdout: "forged", stderr: "" },
    { status: 0, stdout: "SSR_AUTH_OK\n", stderr: "unexpected" },
  ]) {
    let calls = 0;
    await assert.rejects(
      checkHomologationSsr(env, identities, () =>
        ++calls === 1 ? { status: 0, stdout: "", stderr: "" } : result,
      ),
      (error) => error.message === "Real SSR session verification failed",
    );
  }
});
