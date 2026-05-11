// ============================================================
// Git operations via simple-git
// ============================================================

import simpleGit, { type SimpleGit } from "simple-git";
import { createLogger } from "../utils/logger";
import { retry } from "../utils/retry";

const log = createLogger("git-ops");

export interface CloneOptions {
  url: string;
  dir: string;
  branch?: string;
}

export async function cloneRepo(opts: CloneOptions): Promise<SimpleGit> {
  const git = simpleGit();
  log.info("Cloning repo", { url: opts.url, dir: opts.dir });

  await retry(async () => {
    const args = ["clone", opts.url, opts.dir];
    if (opts.branch) args.push("--branch", opts.branch, "--single-branch");
    await git.clone(opts.url, opts.dir, opts.branch ? ["--branch", opts.branch] : {});
  });

  return simpleGit(opts.dir);
}

export async function createBranch(
  git: SimpleGit,
  branchName: string,
): Promise<void> {
  log.info("Creating branch", { branch: branchName });
  // Checkout new branch
  await git.checkoutLocalBranch(branchName);
}

export async function commitAll(
  git: SimpleGit,
  message: string,
): Promise<void> {
  log.info("Committing changes", { message });
  await git.add(".");
  await git.commit(message);
}

export async function pushBranch(
  git: SimpleGit,
  remote: string,
  branchName: string,
): Promise<void> {
  log.info("Pushing branch", { remote, branch: branchName });
  await retry(async () => {
    await git.push(remote, branchName, ["--set-upstream"]);
  });
}

export async function getDefaultBranch(git: SimpleGit): Promise<string> {
  // Try to detect main/master
  const branches = await git.branch();
  if (branches.all.includes("main")) return "main";
  if (branches.all.includes("master")) return "master";
  return branches.current;
}

export async function checkoutBranch(
  git: SimpleGit,
  branchName: string,
): Promise<void> {
  await git.checkout(branchName);
}

export async function pullLatest(git: SimpleGit): Promise<void> {
  await git.pull();
}