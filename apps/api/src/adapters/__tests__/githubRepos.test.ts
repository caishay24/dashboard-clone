import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "../../fetchWithRetry";
import { getGithubRepos } from "../githubRepos";

vi.mock("../../fetchWithRetry", () => ({
  fetchWithRetry: vi.fn()
}));

const fetchWithRetryMock = vi.mocked(fetchWithRetry);

describe("getGithubRepos", () => {
  beforeEach(() => {
    fetchWithRetryMock.mockImplementation(async (input) => {
      const repo = String(input).split("/repos/")[1];
      return new Response(JSON.stringify({
        language: "TypeScript",
        stargazers_count: repo === "tensorflow/tensorflow" ? 200 : 100,
        forks_count: 10,
        open_issues_count: 3,
        pushed_at: "2026-05-14T00:00:00Z",
        html_url: `https://github.com/${repo}`
      }));
    });
  });

  it("enriches allowlisted repos and sorts within the category by stars", async () => {
    const result = await getGithubRepos({ category: "AI / ML" });

    expect(result[0]).toMatchObject({
      repo: "tensorflow/tensorflow",
      category: "AI / ML",
      language: "TypeScript",
      stargazers_count: 200,
      html_url: "https://github.com/tensorflow/tensorflow"
    });
    expect(fetchWithRetryMock).toHaveBeenCalled();
  });
});
