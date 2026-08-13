#!/usr/bin/env node
/** Sets DOCS_DEMO_SEED=1 and runs the standard db:seed script. */
const { execSync } = require("child_process");

process.env.DOCS_DEMO_SEED = "1";
execSync("pnpm db:seed", { stdio: "inherit", env: process.env, cwd: require("path").resolve(__dirname, "../../../..") });
