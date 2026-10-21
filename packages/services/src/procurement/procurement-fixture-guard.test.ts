import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertProcurementFixtureDatabase } from "./fixtures/procurement-regression";

const database = "bloqer_procurement_test_guard";
const devHost = "ep-curly-math-aptjniho.c-7.us-east-1.aws.neon.tech";
const isolatedUrl = `postgresql://synthetic:synthetic@${devHost}/${database}`;

function withEnvironment(values: Record<string, string | undefined>, run: () => void) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("procurement fixture destination guard", { concurrency: false }, () => {
  const valid = {
    BLOQER_PROCUREMENT_TEST_DATABASE: database,
    DATABASE_URL: isolatedUrl,
    DIRECT_URL: isolatedUrl,
  };

  it("accepts only explicitly matching isolated destinations", () => {
    withEnvironment(valid, () => assert.equal(assertProcurementFixtureDatabase(), database));
  });

  it("rejects a missing explicit database selection", () => {
    withEnvironment({ ...valid, BLOQER_PROCUREMENT_TEST_DATABASE: undefined }, () => {
      assert.throws(assertProcurementFixtureDatabase, /database name is required/);
    });
  });

  it("rejects the normal development database even on the allowed compute", () => {
    withEnvironment(
      {
        ...valid,
        BLOQER_PROCUREMENT_TEST_DATABASE: "neondb",
        DATABASE_URL: `postgresql://synthetic:synthetic@${devHost}/neondb`,
      },
      () => {
        assert.throws(
          assertProcurementFixtureDatabase,
          /isolated procurement database is required/,
        );
      },
    );
  });

  it("rejects production even if the database name looks isolated", () => {
    withEnvironment(
      {
        ...valid,
        DATABASE_URL: isolatedUrl.replace(
          devHost,
          "ep-cold-mouse-appkpn84.c-7.us-east-1.aws.neon.tech",
        ),
      },
      () => {
        assert.throws(assertProcurementFixtureDatabase, /verified development compute/);
      },
    );
  });

  it("rejects a direct URL pointing to a different database", () => {
    withEnvironment({ ...valid, DIRECT_URL: isolatedUrl.replace(database, "neondb") }, () => {
      assert.throws(assertProcurementFixtureDatabase, /explicitly selected isolated database/);
    });
  });

  it("rejects a missing direct URL rather than using an environment file", () => {
    withEnvironment({ ...valid, DIRECT_URL: undefined }, () => {
      assert.throws(assertProcurementFixtureDatabase, /Both database URLs must be explicit/);
    });
  });
});
