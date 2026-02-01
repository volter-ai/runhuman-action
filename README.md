# Runhuman Action

Unified GitHub Action for running human QA tests on URLs, PRs, and issues with real testers.

## Features

- **Test URLs directly** with explicit instructions
- **Test GitHub Issues** linked to PRs
- **Automatic issue discovery** from PR bodies
- **Label management** based on test outcomes
- **Workflow failure control** for CI/CD integration

## Usage

### Basic: Test a URL with description

```yaml
- uses: volter-ai/runhuman-action@v1
  with:
    url: 'https://staging.example.com'
    description: 'Test the login flow and verify error messages'
    api-key: ${{ secrets.RUNHUMAN_API_KEY }}
```

### Test linked issues from a PR

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

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `url` | Yes | - | URL to test (must be publicly accessible) |
| `api-key` | Yes | - | Runhuman API key |
| `description` | No | - | Additional test instructions |
| `pr-numbers` | No | - | PR numbers to find linked issues (JSON array or comma-separated) |
| `issue-numbers` | No | - | Issue numbers to test directly (JSON array or comma-separated) |
| `github-token` | No | `${{ github.token }}` | GitHub token for API access |
| `api-url` | No | `https://runhuman.com` | Runhuman API base URL |
| `target-duration-minutes` | No | `5` | Target test duration (1-60 minutes) |
| `screen-size` | No | `desktop` | Screen size (desktop, laptop, tablet, mobile) |

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

## How It Works

1. **Collect Issues**: Finds issues from PRs (via body/title references) and explicit `issue-numbers`
2. **Deduplicate**: Removes duplicate issues
3. **Analyze Testability**: Determines which issues can be tested by a human
4. **Run Tests**: Creates Runhuman jobs for each testable issue
5. **Apply Labels**: Updates issue labels based on outcomes
6. **Report Results**: Sets outputs and optionally fails the workflow

## License

MIT
