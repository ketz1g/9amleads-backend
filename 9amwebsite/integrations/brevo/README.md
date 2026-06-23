# Brevo Integration

## Overview

Placeholder for Brevo email marketing integration.

## Purpose

Brevo will be used for email marketing and automation.

## What It Will Do

1. **Email Lists** - Manage email subscriber lists
2. **Campaigns** - Send email campaigns
3. **Templates** - Use email templates
4. **Automation** - Trigger automated emails

## API Configuration Required

- BREVO_API_KEY - Your Brevo API key
- BREVO_LIST_ID - Target list ID
- BREVO_SENDER_EMAIL - Sender email address
- BREVO_SENDER_NAME - Sender name

## How It Works

1. Leads approved in CRM
2. User click "Send to Brevo"
3. Lead added to Brevo list
4. Campaign can target list

## Safety Features

- Auto-add disabled by default
- Requires approval before adding
- Manual send only
- No automated outreach

## Status

**Currently Disabled** - No real API calls made.

## To Enable

1. Get Brevo account at brevo.com
2. Add API key to Settings
3. Create list and get ID
4. Configure sender details
5. Enable auto-add (optional, requires approval)

## Current Status

Simulation mode: Logs lead ready but no real API call.