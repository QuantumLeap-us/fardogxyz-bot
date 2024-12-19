# FarcasterDog Bot

An automated bot for FarcasterDog that handles daily tasks and main tasks for multiple accounts.

## Features

- Multiple account support (one cookie per line)
- Automated daily tasks completion
- Automated main tasks processing
- Points tracking and management
- Colorful console output
- Auto retry and error handling
- Countdown timer between actions

## Prerequisites

- Node.js v16 or higher
- NPM or Yarn package manager
- Active FarcasterDog account (Register [here](https://fardog.xyz/referral/419792))

## Installation

1. Clone this repository:

```bash
git clone https://github.com/QuantumLeap-us/fardogxyz-bot.git
cd fardogxyz-bot
```

2. Install dependencies:
```bash
npm install
```

3. Configure accounts:
- Add cookies to `data.txt` (one per line)
- Add proxies to `proxies.txt` (optional)

Example `data.txt`:
```
eyJhbGciOiJIUzI1NiIs...
```

Example `proxies.txt`:
```
http://192.168.1.1:8080
```

4. Start the bot:
```bash
node main.js
```

