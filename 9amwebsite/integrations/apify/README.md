# Apify Integration

## Overview

Placeholder for Apify web scraping integration.

## Purpose

Apify will be used for automated lead generation by scraping business directories and websites.

## What It Will Do

1. **Lead Scraping** - Scrape business listings from directories
2. **Data Extraction** - Extract business name, email, phone, website
3. **Validation** - Validate extracted data
4. **Deduplication** - Check for duplicates

## API Configuration Required

- APIFY_API_TOKEN - Your Apify API token
- APIFY_ACTOR_ID - The actor to run

## How It Works

1. User configures search query and location
2. Agent runs Apify actor with parameters
3. Actor scrapes websites for business data
4. Results returned as leads
5. Leads added to "Needs Review"

## Safety Features

- Leads go to "Needs Review" before CRM entry
- Daily limit enforced
- Duplicate checking
- Do-not-contact list checked

## Status

**Currently Disabled** - No real API calls made.

## To Enable

1. Get Apify account at console.apify.com
2. Add API token to Settings
3. Configure default actor
4. Enable auto-scrape (optional, requires approval)

## Current Status

Simulation mode: Generates sample leads for testing.