# AWS Credits Tracker

A Chrome extension that shows **how fast you're burning your AWS credits** and **what each EC2 instance type will cost** while you're launching one.

- 📊 Credits **left**, plus usage **today / yesterday / last 7 days / this month / last 30 days / overall**
- 🔮 **Burn rate**, projected **run-out date**, and a daily budget to use credits before they expire
- 💸 An orange **price badge beside every EC2 instance type** on the launch page, e.g. `t3.micro  $0.0104/hr · $7.59/mo · 41d of credits`
- 🔒 No backend, no analytics. Your keys only ever go to AWS.

> Not affiliated with or endorsed by Amazon Web Services. "AWS" and "Amazon EC2" are trademarks of Amazon.com, Inc.

<!-- Add screenshots to docs/ and uncomment:
![Dashboard](docs/dashboard.png)
![EC2 launch page](docs/ec2-badges.png)
-->

---

## Contents
1. [How it works](#how-it-works)
2. [Install](#install)
3. [AWS setup](#aws-setup-one-time)
4. [Configure the extension](#configure-the-extension)
5. [Using it](#using-it)
6. [How "credits left" is calculated](#how-credits-left-is-calculated)
7. [Cost of using this extension](#cost-of-using-this-extension)
8. [Security & privacy](#security--privacy)
9. [Troubleshooting](#troubleshooting)
10. [Limitations](#limitations)
11. [Development](#development)
12. [License](#license)

---

## How it works

| Feature | AWS API used | Cost |
|---|---|---|
| Dashboard (usage, credits applied, services) | Cost Explorer `GetCostAndUsage` | $0.01 per request (2 requests per refresh) |
| EC2 launch-page badges | Price List `GetProducts` | Free |

Requests are signed in the browser with AWS Signature V4 using the IAM access key you provide.

AWS has **no public API for the remaining credit balance**. So you enter the **total credits you were granted**, and the extension subtracts the credits that Cost Explorer reports as already applied (see [below](#how-credits-left-is-calculated)).

## Install

**From a release (recommended)**
1. Download the latest `aws-credits-tracker-vX.Y.Z.zip` from the [Releases](../../releases) page and unzip it.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder.

**From source**
```bash
git clone https://github.com/y8shas/aws-credits-tracker.git
```
Then in `chrome://extensions` → **Load unpacked** → choose the `extension/` folder.

Works in Chrome / Edge / Brave (Chromium ≥ 105). Pin the extension to the toolbar for quick access.

**Updating:** pull / download the new version, then click the ⟳ reload icon on the extension card in `chrome://extensions`. Your settings are kept.

## AWS setup (one time)

You need a **read-only IAM user** — never use root keys.

1. **Create the IAM policy.** IAM → Policies → Create policy → JSON, paste [`iam-policy.json`](iam-policy.json):
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       { "Effect": "Allow", "Action": ["ce:GetCostAndUsage", "pricing:GetProducts"], "Resource": "*" }
     ]
   }
   ```
   (The extension popup also has a *Copy policy* button.)
2. **Create an IAM user** and attach that policy.
3. **Let IAM users see billing data.** Sign in as the *account owner (root)* → account menu → **Account** → scroll to **IAM user and role access to Billing information** → **Edit** → **Activate IAM Access**. *Without this, Cost Explorer calls return "Access denied" even with the right policy.*
4. **Enable Cost Explorer.** Open **Billing and Cost Management → Cost Explorer** once. If you've never used it, AWS can take **up to 24 hours** to prepare the first data.
5. **Create an access key** for the IAM user (Security credentials → Create access key → *Third-party service* / *Other*). Copy the Access key ID and Secret access key.

## Configure the extension

Click the extension icon → ⚙ and fill in:

| Field | What to enter |
|---|---|
| Access key ID / Secret access key | From step 5 above |
| Session token | Only if you use temporary `ASIA…` credentials |
| Remember keys on this device | On = stored in Chrome profile storage. Off = forgotten when Chrome closes |
| **Total credits** | The total $ you were granted (e.g. `200`) |
| **Credits start date** | The date the credits were granted — needed for an accurate balance |
| Credits expiry date | Optional — enables the expiry budget and warning |
| Cache | How long dashboard data is reused before calling AWS again (default 60 min) |
| OS for prices | Linux (default), Windows, RHEL or SUSE — used for EC2 badges |
| Hours per month | Used for the "/mo" price (default 730 = 24×365/12) |

Click **Save & load**.

## Using it

**Dashboard** — click the toolbar icon. The icon badge shows credits left in dollars (updated on each refresh). Hit ⟳ to force a refresh.

**EC2 price badges** — open the EC2 console → **Launch instance** (or Instance types) and open the instance-type dropdown. Every type gets a badge:

`$0.0104/hr · $7.59/mo · 41d of credits`

- `/mo` = hourly price × your hours-per-month setting
- `Nd of credits` = how many days your remaining credits would last running *that* instance 24/7
- Hover a badge for daily and weekly cost
- The region is read from the console URL, so switching region updates the prices. Prices are cached for 7 days per region/OS.

## How "credits left" is calculated

```
credits left = total credits you entered − credits applied since the start date
```

"Credits applied" comes from Cost Explorer's `Credit` record type. For each period shown, if no credits were applied the extension falls back to **gross usage** so the numbers still mean something. Because AWS data lags up to ~24 h, *today* is partial and may jump on the next refresh. All dates are **UTC**.

If you received several credit grants, enter the **sum** and use the **earliest** start date.

## Cost of using this extension

Cost Explorer API requests are billed at **$0.01 each**. A refresh makes **2** requests (~$0.02). With the default 60-minute cache, checking all day costs a few cents. The Price List API is free. Raise the cache time in settings if you want to minimise it.

## Security & privacy

- No server, analytics or telemetry. See [PRIVACY.md](PRIVACY.md).
- Network traffic: only `ce.us-east-1.amazonaws.com` and `api.pricing.us-east-1.amazonaws.com`.
- Keys live in `chrome.storage.session` (memory, cleared when Chrome closes). They are written to `chrome.storage.local` **only** if "Remember keys" is on.
- `storage.local` is restricted to extension pages; the script that runs on the AWS console **cannot read your keys** — it only receives non-secret values (OS, hours, credits left).
- Use a **dedicated read-only IAM user**, rotate the key periodically, and deactivate it if you stop using the extension. The policy above cannot create, change or delete any resource.
- *Settings → Remove keys & all stored data* wipes everything.

Found a vulnerability? Please open a private security advisory on GitHub rather than a public issue.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Access denied…" | Policy missing an action, or step 3 (IAM billing access) not done |
| "AWS does not recognise this access key ID" | Typo, deleted/deactivated key, or a temporary key without its session token |
| "Secret access key looks wrong — or clock off" | Re-paste the secret; also check your computer's date/time is correct |
| "Cost Explorer has no data yet" | Just enabled it — wait up to 24 h |
| Numbers look too low | Set the **credits start date**; usage before it isn't counted |
| No badges on the launch page | Add keys in the popup; make sure the policy includes `pricing:GetProducts`; reload the console tab. A red/blue message appears bottom-right of the console explaining what failed |
| Badges missing for some types | Only types with an On-Demand price for your region + OS are shown |
| Dashboard works, badges don't (or vice-versa) | The two features use different IAM actions — check both are in the policy |

## Limitations

- Credits balance is **calculated**, not read from AWS (no public API exists).
- Badge prices are **On-Demand, instance only** — EBS, data transfer, public IPv4, Savings Plans/Reserved/Spot are not included, and it doesn't multiply by "Number of instances".
- The badge feature depends on the AWS console's page text; if AWS redesigns the console it may need a small update (issues/PRs welcome).
- Daily history is limited to ~12 months by Cost Explorer.
- AWS China and GovCloud consoles are not supported.

## Development

```
extension/        # the Chrome extension (load this folder unpacked)
  manifest.json   # MV3 manifest
  sigv4.js        # AWS Signature V4 signer + API client
  calc.js         # pure logic: parsing, credit maths, error messages
  store.js        # key / settings storage
  background.js   # service worker: price fetching, content-script bridge
  content.js/css  # EC2 launch-page badges
  popup.*         # dashboard + settings UI
tests/            # node --test (includes the official AWS SigV4 example)
scripts/build.sh  # builds dist/aws-credits-tracker-vX.Y.Z.zip
```

```bash
npm test          # run unit tests (Node ≥ 20)
npm run build     # create the release zip in dist/
```

CI (`.github/workflows/ci.yml`) runs the tests and builds the zip on every push. To release: bump `version` in `extension/manifest.json` and `package.json`, update `CHANGELOG.md`, tag, and attach the zip from `dist/` to a GitHub Release.

## License

[MIT](LICENSE)
