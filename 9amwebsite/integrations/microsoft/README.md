# Microsoft Integration

## Overview

Placeholder for Microsoft 365 / Copilot integration.

## Purpose

Microsoft integration will be used for:
- Microsoft 365 calendar sync
- Email integration (Outlook)
- Teams integration
- Copilot AI assistance

## What It Will Do

1. **Calendar Sync** - Sync tasks with Outlook calendar
2. **Email Integration** - Send emails via Outlook
3. **Teams** - Teams notifications
4. **Copilot** - AI assistance for tasks

## API Configuration Required

- MICROSOFT_CLIENT_ID - Azure AD app client ID
- MICROSOFT_CLIENT_SECRET - Azure AD app secret
- MICROSOFT_TENANT_ID - Azure AD tenant ID

## How It Works

1. User authenticates with Microsoft
2. App gets OAuth tokens
3. Can access calendar, email, etc.
4. Tasks sync with Outlook

## Safety Features

- OAuth authentication required
- Scopes limited to necessary permissions
- User controls what syncs

## Status

**Not Implemented** - Future integration.

## To Enable

1. Register app in Azure Portal
2. Configure OAuth redirects
3. Add credentials to Settings
4. Grant necessary permissions