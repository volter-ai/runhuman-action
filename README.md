# Runhuman Action

Unified GitHub Action for running human QA tests on URLs, PRs, and issues with real testers.

## Features

- **Test URLs directly** with explicit instructions
- **Test GitHub Issues** linked to PRs
- **Automatic issue discovery** from PR bodies
- **Automatic project management** - projects are auto-created based on your GitHub repository
- **Label management** based on test outcomes
- **Workflow failure control** for CI/CD integration
- **User-scoped API keys** - one key works across all your projects

## Quick Start

Get your API key from [runhuman.com/settings/api-keys](https://runhuman.com/settings/api-keys) and add it as `RUNHUMAN_API_KEY` in your repository secrets.

## Usage

### Basic: Test a URL with description

```yaml
- uses: volter-ai/runhuman-action@v1
  with:
    url: 'https://staging.example.com'
    description: 'Test the login flow and verify error messages'
    api-key: ${{ secrets.RUNHUMAN_API_KEY }}
```

**How it works:** The action automatically creates a project for your repository (`owner/repo`) if one doesn't exist, then runs the test against it.

### Test linked issues from a PR (Recommended)

```yaml
- uses: volter-ai/runhuman-action@v1
  with:
    url: 'https://staging.example.com'
    pr-numbers: '[${{ github.event.pull_request.number }}]'
    api-key: ${{ secrets.RUNHUMAN_API_KEY }}
    github-token: ${{ secrets.GITHUB_TOKEN }}
    on-success-add-labels: '["stage:done"]'
    on-success-remove-labels: '["stage:qa"]'
    on-failure-add-labels: '["runhuman:qa-failed"]'
    fail-on-failure: true
```

This is the recommended approach for PR-based workflows. The action:
1. Finds all issues linked in the PR body (e.g., "Closes #123")
2. Analyzes each issue to determine if it's testable by a human
3. Creates test jobs for testable issues
4. Updates labels based on test outcomes

### Test specific issues

```yaml
- uses: volter-ai/runhuman-action@v1
  with:
    url: 'https://staging.example.com'
    issue-numbers: '[123, 456, 789]'
    api-key: ${{ secrets.RUNHUMAN_API_KEY }}
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Combined: PRs + issues + description

```yaml
- uses: volter-ai/runhuman-action@v1
  with:
    url: 'https://staging.example.com'
    pr-numbers: '[123]'
    issue-numbers: '[456]'
    description: 'Also verify the header renders correctly'
    api-key: ${{ secrets.RUNHUMAN_API_KEY }}
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Full Example: PR Workflow with Auto-QA

```yaml
name: PR Workflow

on:
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Your existing tests
      - name: Run unit tests
        run: npm test

      # Deploy to staging
      - name: Deploy to staging
        run: ./deploy-staging.sh

      # Run human QA on linked issues
      - name: QA Test
        uses: volter-ai/runhuman-action@v1
        with:
          url: ${{ vars.STAGING_URL }}
          pr-numbers: '[${{ github.event.pull_request.number }}]'
          api-key: ${{ secrets.RUNHUMAN_API_KEY }}
          target-duration-minutes: 5
          on-success-add-labels: '["qa:passed"]'
          on-failure-add-labels: '["qa:failed"]'
          fail-on-failure: true
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `url` | Yes | - | URL to test (must be publicly accessible) |
| `api-key` | Yes | - | User-scoped Runhuman API key (get from [Settings → API Keys](https://runhuman.com/settings/api-keys)) |
| `description` | No | - | Additional test instructions |
| `pr-numbers` | No | - | PR numbers to find linked issues (JSON array or comma-separated) |
| `issue-numbers` | No | - | Issue numbers to test directly (JSON array or comma-separated) |
| `github-token` | No | `${{ github.token }}` | GitHub token for reading PR/issue data |
| `api-url` | No | `https://runhuman.com` | Runhuman API base URL |
| `target-duration-minutes` | No | `5` | Target test duration (1-60 minutes) |
| `screen-size` | No | `desktop` | Screen size (desktop, laptop, tablet, mobile) |
| `output-schema` | No | - | JSON schema for structured test results |
| `can-create-github-issues` | No | `false` | Allow tester to create GitHub issues for bugs found |

### Label Callbacks

| Input | Description |
|-------|-------------|
| `on-success-add-labels` | Labels to add on test success (JSON array) |
| `on-success-remove-labels` | Labels to remove on test success (JSON array) |
| `on-failure-add-labels` | Labels to add on test failure (JSON array) |
| `on-failure-remove-labels` | Labels to remove on test failure (JSON array) |
| `on-not-testable-add-labels` | Labels to add when issue is not testable (JSON array) |
| `on-not-testable-remove-labels` | Labels to remove when issue is not testable (JSON array) |
| `on-timeout-add-labels` | Labels to add on test timeout (JSON array) |
| `on-timeout-remove-labels` | Labels to remove on test timeout (JSON array) |

### Workflow Control

| Input | Default | Description |
|-------|---------|-------------|
| `fail-on-error` | `true` | Fail the workflow on system errors |
| `fail-on-failure` | `true` | Fail the workflow if any test fails |
| `fail-on-timeout` | `false` | Fail the workflow if tester times out |

## Outputs

| Output | Description |
|--------|-------------|
| `status` | Test status (completed, error, timeout, no-issues) |
| `success` | Whether all tests passed (true/false) |
| `tested-issues` | JSON array of tested issue numbers |
| `passed-issues` | JSON array of passed issue numbers |
| `failed-issues` | JSON array of failed issue numbers |
| `not-testable-issues` | JSON array of not-testable issue numbers |
| `timed-out-issues` | JSON array of timed-out issue numbers |
| `results` | Full JSON results object |
| `cost-usd` | Total cost in USD |
| `duration-seconds` | Total duration in seconds |

## Authentication & Project Management

### User-Scoped API Keys

Runhuman uses **user-scoped API keys** that work across all your projects:

- **Get your key:** Visit [runhuman.com/settings/api-keys](https://runhuman.com/settings/api-keys)
- **Add to repository:** Store as `RUNHUMAN_API_KEY` in your repository secrets
- **Use anywhere:** The same key works for all your repositories

### Automatic Project Creation

When you run a test, Runhuman automatically:

1. **Looks up your repository** (`owner/repo` from GitHub context)
2. **Finds or creates a project** for that repository
3. **Runs the test** against that project

You don't need to manually create projects or configure project IDs. Everything is automatic based on your GitHub repository.

## How It Works

1. **Collect Issues**: Finds issues from PRs (via body/title references) and explicit `issue-numbers`
2. **Deduplicate**: Removes duplicate issues
3. **Analyze Testability**: Determines which issues can be tested by a human
4. **Run Tests**: Creates Runhuman jobs for each testable issue (auto-creating projects as needed)
5. **Apply Labels**: Updates issue labels based on outcomes
6. **Report Results**: Sets outputs and optionally fails the workflow

## Error Handling

The action includes built-in retry logic for transient errors:

- **Network errors** (ECONNRESET, ETIMEDOUT, etc.) - retried up to 3 times
- **Server errors** (503, 502, 504, 500, 429) - retried up to 3 times with exponential backoff

If analysis or job creation fails after retries, the action fails rather than silently skipping issues. This ensures issues aren't closed without proper verification.

## License

MIT
