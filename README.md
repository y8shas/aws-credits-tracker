# AWS Credits Tracker

A Chrome extension that shows how quickly your AWS credits are being consumed and how much each EC2 instance type will cost while you are launching it.

- 📊 See your remaining credits, daily usage, burn rate, and projected run-out date
- 💸 View live EC2 price badges right on the AWS launch page
- 🔒 No backend. No analytics. Your AWS keys stay in your browser and only go to AWS

> Not affiliated with or endorsed by Amazon Web Services. "AWS" and "Amazon EC2" are trademarks of Amazon.com, Inc.

<div align="center">
  <img alt="AWS Credits Tracker dashboard preview" src="https://via.placeholder.com/1200x500?text=Dashboard+Preview" />
</div>

<!-- Add screenshots to docs/ and uncomment:
![Dashboard](docs/dashboard.png)
![EC2 launch page](docs/ec2-badges.png)
-->

---

## Why use this?

If you are using AWS credits, the biggest challenge is often not just knowing how much you have left, but understanding:

- how fast your credits are being used
- whether you are on pace to spend them before they expire
- how expensive a given EC2 instance is before you launch it

This extension helps answer those questions without sending your data anywhere except AWS.

---

## Features

### Dashboard

Track your AWS credits over time:

- remaining credits
- usage today, yesterday, last 7 days, this month, last 30 days, and overall
- burn rate
- projected run-out date
- daily budget before expiry
- cost breakdown by service

### EC2 launch-page badges

On the EC2 launch page, each instance type gets a small orange badge like this:

`$0.0104/hr · $7.59/mo · 41d of credits`

This helps you quickly compare cost and credit lifetime before selecting an instance.

### Privacy-first design

- No server backend
- No telemetry or analytics
- Keys only go directly to AWS from your browser
- Works with a read-only IAM user

---

## Installation

### From a release (recommended)

1. Download the latest `aws-credits-tracker-vX.Y.Z.zip` from the [Releases](../../releases) page.
2. Unzip it.
3. Open `chrome://extensions`.
4. Enable Developer mode.
5. Click Load unpacked and select the unzipped folder.

### From source

```bash
git clone https://github.com/y8shas/aws-credits-tracker.git
```

Then in Chrome:

- open `chrome://extensions`
- enable Developer mode
- click Load unpacked
- choose the `extension/` folder

Works in Chrome, Edge, and Brave on Chromium 105+.

Pin the extension to your toolbar for quick access.

### Updating

Pull or download the new version, then click the reload icon on the extension card in `chrome://extensions`.

Your saved settings are kept.

---

## AWS setup (one-time)

You need a dedicated read-only IAM user. Do not use your root access keys.

### 1) Create the IAM policy

Open AWS IAM → Policies → Create policy → JSON and paste the contents of [`iam-policy.json`](iam-policy.json):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ce:GetCostAndUsage", "pricing:GetProducts"],
      "Resource": "*"
    }
  ]
}
```

The extension popup also includes a Copy policy button.

### 2) Create an IAM user

Create a new IAM user and attach the policy above.

### 3) Allow IAM users to view billing data

Sign in as the AWS account owner (root) and go to:

- Account menu → Account
- find IAM user and role access to Billing information
- click Edit
- enable access for the IAM user

### 4) Enable Cost Explorer

Open Billing and Cost Management → Cost Explorer once.

If you have never used Cost Explorer before, AWS may take up to 24 hours to prepare the first data.

### 5) Create an access key

In IAM, create a new access key for that user:

- Security credentials → Create access key
- choose Third-party service / Other
- copy the Access key ID and Secret access key

---

## Configure the extension

Click the extension icon and open Settings (`⚙`).

| Field | What to enter |
|---|---|
| Access key ID | From the IAM user you created |
| Secret access key | From the IAM user you created |
| Session token | Only if you use temporary ASIA credentials |
| Remember keys on this device | On = stored in Chrome profile storage; Off = forgotten when Chrome closes |
| Total credits | The total amount of credits granted to you (for example `200`) |
| Credits start date | The date those credits began; needed for an accurate balance |
| Credits expiry date | Optional; enables expiry budget and warning alerts |
| Cache | How long to reuse AWS dashboard data before fetching again (default: 60 minutes) |
| OS for prices | Linux, Windows, RHEL, or SUSE |
| Hours per month | Used for the `/mo` price display (default: 730) |

Then click Save & load.

---

## How it works

| Feature | AWS API used | Cost |
|---|---|---|
| Dashboard: usage, credits applied, services | Cost Explorer `GetCostAndUsage` | $0.01 per request (2 requests per refresh) |
| EC2 launch-page badges | Price List `GetProducts` | Free |

The extension signs requests in the browser using AWS Signature V4 with the access key you provide.

AWS does not expose a public API for the remaining credit balance, so the extension asks you for the total credits granted and subtracts any credits already applied according to Cost Explorer data.

---

## How "credits left" is calculated

```text
credits left = total credits entered - credits applied since the credits start date
```

The extension uses Cost Explorer's `Credit` record type to calculate how much of your credit pool has already been used.

If a period has no credit data, it falls back to gross usage so the numbers remain meaningful.

If you received multiple credit grants, add them together and use the earliest start date.

---

## Using the extension

### Dashboard

Click the toolbar icon to open the dashboard.

- the browser action badge shows how much credit remains
- use the refresh button to force a new fetch from AWS
- each period shows usage and projected burn

### EC2 price badges

Open the EC2 console and go to Launch instance or Instance types.

Every instance type gets a badge like:

`$0.0104/hr · $7.59/mo · 41d of credits`

What the badge means:

- `/mo` = hourly price × your configured hours-per-month setting
- `Nd of credits` = how many days your remaining credits would last if that instance were running continuously
- hover for daily and weekly cost estimates
- the region is read from the URL, so switching region updates prices automatically
- prices are cached for 7 days per region and OS

---

## Cost of using this extension

The Cost Explorer API is billed at $0.01 per request.

A refresh does 2 requests, so each refresh costs about $0.02. With the default 60-minute cache, checking throughout the day is only a few cents.

The Price List API is free.

---

## Security & privacy

- No server, analytics, or telemetry. See [PRIVACY.md](PRIVACY.md).
- Network traffic is limited to AWS endpoints: `ce.us-east-1.amazonaws.com` and `api.pricing.us-east-1.amazonaws.com`
- Keys are stored in `chrome.storage.session` by default and are cleared when Chrome closes
- If you enable Remember keys, they are also written to `chrome.storage.local`
- `storage.local` is restricted to extension pages; the AWS console scripts cannot read your keys
- Use a dedicated read-only IAM user, rotate the key periodically, and disable it if you stop using the extension
- Settings → Remove keys & all stored data wipes everything

Found a vulnerability? Please report it privately via a security advisory instead of opening a public issue.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Access denied | The policy may be missing an action or the billing access step was not enabled |
| AWS does not recognize the access key ID | Check for typos, deleted or deactivated keys, or a temporary key that needs a session token |
| Secret access key looks wrong / clock off | Re-paste the key and verify your computer time is correct |
| Cost Explorer has no data yet | Wait up to 24 hours after enabling it |
| Numbers look too low | Set the credits start date; usage before that date is not counted |
| No badges on the launch page | Add keys in the popup, confirm the policy includes `pricing:GetProducts`, and reload the AWS console tab |
| Badges missing for some instance types | Only types with an On-Demand price in your region and OS are shown |
| Dashboard works but badges do not, or vice versa | The two features use different IAM actions; ensure both are in the policy |

---

## Limitations

- Credits are calculated rather than read directly from AWS, because there is no public API for the remaining balance
- Badge prices are On-Demand and instance-only; they do not include EBS, data transfer, public IPv4, Reserved/Spot/Savings Plans, or multi-instance totals
- The badge feature depends on the AWS console page structure and may need updates if AWS changes the UI
- Cost Explorer data is limited to roughly 12 months of daily history
- AWS China and GovCloud consoles are not supported

---

## Development

```text
extension/        # Chrome extension (load this folder unpacked)
  manifest.json   # MV3 manifest
  sigv4.js        # AWS Signature V4 signer and API client
  calc.js         # logic for parsing, credit math, and error messages
  store.js        # key and settings storage
  background.js   # service worker for price fetches and bridge logic
  content.js/css  # EC2 launch-page badge injection
  popup.*         # dashboard and settings UI

tests/            # Node test suite
scripts/build.sh  # builds dist/aws-credits-tracker-vX.Y.Z.zip
```

```bash
npm test
npm run build
```

CI runs the tests and build automatically with GitHub Actions. To release:

1. bump the version in `extension/manifest.json` and `package.json`
2. update `CHANGELOG.md`
3. tag the release
4. attach the zip from `dist/`

---

## License

[MIT](LICENSE)
