# Privacy

AWS Credits Tracker runs entirely in your browser.

- **No servers, no analytics, no telemetry.** There is no backend owned by the author.
- **Network requests** go only to `ce.us-east-1.amazonaws.com` (AWS Cost Explorer) and `api.pricing.us-east-1.amazonaws.com` (AWS Price List), signed with the IAM key you provide.
- **Stored data** (in Chrome's extension storage on your device): your access key, optionally your secret key, your settings, and cached cost/price data. Use *Settings → Remove keys & all stored data* to wipe everything.
- **EC2 console page:** the content script only reads instance-type names on `*.console.aws.amazon.com/ec2/*` to add price badges. It never sends page content anywhere.
