const axios = require("axios");
const fs = require("fs");
const displayBanner = require("./config/banner");
const colors = require("./config/colors");
const CountdownTimer = require("./config/countdown");
const logger = require("./config/logger");
const { HttpsProxyAgent } = require('https-proxy-agent');

const CONFIG = {
  BASE_URL: "https://api.fardog.xyz/api",
  COOKIE_FILE: "data.txt",
  PROXY_FILE: "proxies.txt",
  DELAYS: {
    BETWEEN_REQUESTS: 1000,
    BETWEEN_TASKS: 2000,
    BETWEEN_ACCOUNTS: 5000,
    CHECK_INTERVAL: 24 * 60 * 60 * 1000,
  },
  PROXY_CONFIG: {
    timeout: 10000,
    maxRetries: 3,
    retryDelay: 1000,
  },
  HEADERS: {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'DNT': '1',
    'Origin': 'https://farcasterdog.xyz',
    'Pragma': 'no-cache',
    'Referer': 'https://farcasterdog.xyz/',
    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
};

const ENDPOINTS = {
  LOGIN_CHECK: "/login_farquest_dog/check-status",
  USER_INFO: "/user/select",
  POINTS: "/point/select_point_by_fid",
  DAILY_TASKS: "/user/all_task/task_daily",
  MAIN_TASKS: "/user/all_task/task_main",
  CLICK_TASK: "/user/reg_click_status",
  UPDATE_TASK: "/user/task/task_daily/select_updated_task",
  UPDATE_POINTS: "/user/update_point",
  OPEN_MAGIC_CHEST: "/farcaster_dog/open_magic_chest",
};

class FarcasterAccount {
  constructor(cookie, proxy, index) {
    this.cookie = cookie;
    this.proxy = proxy;
    this.index = index;
    this.proxyEnabled = proxy !== null;
    this.name = `Account ${index}`;
    this.proxyIP = null;
  }
}

class FarcasterBot {
  constructor() {
    this.baseUrl = CONFIG.BASE_URL;
    this.accounts = [];
    this.proxies = [];
    this.proxyFailureCount = {};
    this.workingProxies = new Set();
    this.proxyIPs = new Map();
    this.isRunning = false;
  }

  async initialize() {
    try {
      await this.loadProxies();
      this.loadAccounts();
      return true;
    } catch (error) {
      logger.error(`${colors.error}Failed to initialize: ${error.message}${colors.reset}`);
      return false;
    }
  }

  async testProxy(proxy) {
    try {
      const proxyUrl = new URL(proxy);
      const proxyConfig = {
        protocol: proxyUrl.protocol,
        host: proxyUrl.hostname,
        port: proxyUrl.port,
        auth: proxyUrl.username ? {
          username: proxyUrl.username,
          password: proxyUrl.password
        } : undefined,
        rejectUnauthorized: false
      };

      const config = {
        method: 'get',
        url: 'https://api.ipify.org?format=json',
        timeout: 5000,
        headers: {
          'User-Agent': CONFIG.HEADERS['User-Agent']
        },
        httpsAgent: new HttpsProxyAgent(proxyConfig),
        proxy: false,
        validateStatus: function (status) {
          return status >= 200 && status < 500;
        }
      };

      const startTime = Date.now();
      const response = await axios(config);
      const responseTime = Date.now() - startTime;

      if (response.status === 200 && response.data.ip) {
        const proxyIP = response.data.ip;
        logger.success(`${colors.success}Proxy IP: ${proxyIP} (${responseTime}ms)${colors.reset}`);
        return { success: true, ip: proxyIP };
      } else {
        logger.error(`${colors.error}Invalid proxy response${colors.reset}`);
        return { success: false, ip: null };
      }
    } catch (error) {
      logger.error(`${colors.error}Proxy error: ${error.message}${colors.reset}`);
      return { success: false, ip: null };
    }
  }

  async loadProxies() {
    try {
      if (fs.existsSync(CONFIG.PROXY_FILE)) {
        const proxyLines = fs
          .readFileSync(CONFIG.PROXY_FILE, "utf8")
          .split("\n")
          .filter((line) => line.trim());

        this.proxies = [];
        this.workingProxies.clear();
        this.proxyIPs = new Map();

        if (proxyLines.length === 0) {
          logger.warn(
            `${colors.warning}No proxies found in proxies.txt. Running without proxies.${colors.reset}`
          );
          return;
        }

        for (const line of proxyLines) {
          let proxy = line.trim();
          if (!proxy) continue;
          
          if (!proxy.startsWith('http://') && !proxy.startsWith('https://')) {
            proxy = `http://${proxy}`;
          }
          
          this.proxies.push(proxy);
          const result = await this.testProxy(proxy);
          if (result.success) {
            this.workingProxies.add(proxy);
            this.proxyIPs.set(proxy, result.ip);
          }
        }

        if (this.workingProxies.size > 0) {
          logger.info(`${colors.info}Found ${this.workingProxies.size} working proxies${colors.reset}`);
        } else {
          logger.warn(`${colors.warning}No working proxies found. Running without proxies.${colors.reset}`);
        }
      } else {
        fs.writeFileSync(CONFIG.PROXY_FILE, "");
        logger.warn(
          `${colors.warning}Created proxies.txt file. Add proxies in format: ip:port or http://ip:port${colors.reset}`
        );
      }
    } catch (error) {
      logger.error(
        `${colors.error}Error loading proxies: ${error.message}${colors.reset}`
      );
    }
  }

  loadAccounts() {
    try {
      if (fs.existsSync(CONFIG.COOKIE_FILE)) {
        const cookies = fs
          .readFileSync(CONFIG.COOKIE_FILE, "utf8")
          .split("\n")
          .filter((line) => line.trim());

        if (cookies.length === 0) {
          logger.error(
            `${colors.error}No cookies found in data.txt. Please add one cookie per line.${colors.reset}`
          );
          process.exit(1);
        }

        const workingProxiesArray = Array.from(this.workingProxies);
        
        this.accounts = cookies.map((cookie, index) => {
          let proxy = null;
          if (workingProxiesArray.length > 0) {
            proxy = workingProxiesArray[index % workingProxiesArray.length];
            const proxyIP = this.proxyIPs.get(proxy);
            logger.info(`${colors.info}Account ${index + 1} -> ${proxyIP}${colors.reset}`);
          }
          
          const account = new FarcasterAccount(cookie.trim(), proxy, index + 1);
          account.proxyIP = proxy ? this.proxyIPs.get(proxy) : null;
          return account;
        });

        logger.info(
          `${colors.info}Loaded ${this.accounts.length} accounts${colors.reset}`
        );
      } else {
        fs.writeFileSync(CONFIG.COOKIE_FILE, "");
        logger.error(
          `${colors.error}Created data.txt file. Please add one cookie per line and restart the bot.${colors.reset}`
        );
        process.exit(1);
      }
    } catch (error) {
      logger.error(
        `${colors.error}Error loading accounts: ${error.message}${colors.reset}`
      );
      process.exit(1);
    }
  }

  async makeRequest(method, endpoint, data = null, account) {
    try {
      const config = {
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers: {
          ...CONFIG.HEADERS,
          Cookie: `token=${account.cookie}`,
        },
        data,
        timeout: CONFIG.PROXY_CONFIG.timeout,
        maxRedirects: 5,
        validateStatus: function (status) {
          return status >= 200 && status < 500;
        }
      };

      if (account.proxy && account.proxyEnabled) {
        try {
          const proxyUrl = new URL(account.proxy);
          const proxyConfig = {
            protocol: proxyUrl.protocol,
            host: proxyUrl.hostname,
            port: proxyUrl.port,
            auth: proxyUrl.username ? {
              username: proxyUrl.username,
              password: proxyUrl.password
            } : undefined,
            rejectUnauthorized: false
          };

          const proxyAgent = new HttpsProxyAgent(proxyConfig);
          config.httpsAgent = proxyAgent;
          config.proxy = false;
          config.headers['X-Forwarded-For'] = proxyUrl.hostname;
          config.headers['X-Forwarded-Proto'] = 'https';
          
          const startTime = Date.now();
          // 只在登录和开始任务时显示代理信息
          if (endpoint.includes('login') || endpoint.includes('user/info') || endpoint === '/tasks') {
            const proxyIP = this.proxyIPs.get(account.proxy);
            logger.info(`${colors.info}Using proxy: ${proxyIP}${colors.reset}`);
          }
          
          let lastError = null;
          for (let attempt = 1; attempt <= CONFIG.PROXY_CONFIG.maxRetries; attempt++) {
            try {
              const response = await axios(config);
              if (response.data) {
                const responseTime = Date.now() - startTime;
                this.proxyFailureCount[account.proxy] = 0;
                if (attempt > 1) {
                  logger.success(`${colors.success}Request succeeded after ${attempt} attempts (${responseTime}ms)${colors.reset}`);
                }
                return response.data;
              } else {
                throw new Error('Empty response data');
              }
            } catch (proxyRequestError) {
              lastError = proxyRequestError;
              this.proxyFailureCount[account.proxy] = (this.proxyFailureCount[account.proxy] || 0) + 1;
              
              if (proxyRequestError.code === 'ECONNREFUSED' || proxyRequestError.code === 'ETIMEDOUT') {
                logger.error(`${colors.error}Proxy connection failed (${proxyRequestError.code}), disabling proxy${colors.reset}`);
                account.proxyEnabled = false;
                break;
              }
              
              if (attempt < CONFIG.PROXY_CONFIG.maxRetries) {
                logger.error(`${colors.error}Proxy request failed (${attempt}/${CONFIG.PROXY_CONFIG.maxRetries}): ${proxyRequestError.message}${colors.reset}`);
                logger.info(`${colors.info}Retrying in ${CONFIG.PROXY_CONFIG.retryDelay}ms...${colors.reset}`);
                await new Promise(resolve => setTimeout(resolve, CONFIG.PROXY_CONFIG.retryDelay));
              }
            }
          }

          if (!account.proxyEnabled || this.proxyFailureCount[account.proxy] >= CONFIG.PROXY_CONFIG.maxRetries) {
            logger.error(`${colors.error}All proxy attempts failed, disabling proxy${colors.reset}`);
            account.proxyEnabled = false;
            
            logger.info(`${colors.info}Falling back to direct connection...${colors.reset}`);
            delete config.httpsAgent;
            delete config.proxy;
            delete config.headers['X-Forwarded-For'];
            delete config.headers['X-Forwarded-Proto'];
            
            const directResponse = await axios(config);
            return directResponse.data;
          }
        } catch (proxyError) {
          logger.error(`${colors.error}Failed to configure proxy: ${proxyError.message}${colors.reset}`);
          account.proxyEnabled = false;
          logger.info(`${colors.info}Falling back to direct connection...${colors.reset}`);
          const response = await axios(config);
          return response.data;
        }
      } else {
        // 只在登录和开始任务时显示连接信息
        if (endpoint.includes('login') || endpoint.includes('user/info') || endpoint === '/tasks') {
          const connectionType = account.proxy ? ' (proxy disabled)' : '';
          logger.info(`${colors.info}Using direct connection${connectionType}${colors.reset}`);
        }
        const response = await axios(config);
        return response.data;
      }
    } catch (error) {
      if (
        !(
          endpoint === ENDPOINTS.OPEN_MAGIC_CHEST &&
          error.response?.status === 400
        )
      ) {
        logger.error(
          `${colors.error}Request failed: ${error.message}${colors.reset}`
        );
      }
      return null;
    }
  }

  async checkLoginStatus(account) {
    try {
      const response = await this.makeRequest(
        "GET",
        ENDPOINTS.LOGIN_CHECK,
        null,
        account
      );
      const isLoggedIn = response && response.status === true;
      if (isLoggedIn) {
        logger.success(`${colors.success}Login successful${colors.reset}`);
      }
      return isLoggedIn;
    } catch (error) {
      logger.error(
        `${colors.error}Login failed: ${error.message}${colors.reset}`
      );
      return false;
    }
  }

  async initializeAccount(account) {
    try {
      const userInfo = await this.getUser(account);
      if (!userInfo || typeof userInfo.fid === "undefined") {
        throw new Error("Failed to get user info or FID");
      }
      account.fid = String(userInfo.fid);
      this.displayAccountInfo(userInfo, account);
      return true;
    } catch (error) {
      logger.error(
        `${colors.error}Error initializing: ${error.message}${colors.reset}`
      );
      return false;
    }
  }

  async getUser(account) {
    const response = await this.makeRequest(
      "GET",
      ENDPOINTS.USER_INFO,
      null,
      account
    );
    return Array.isArray(response) ? response[0] : response;
  }

  async getPoints(account) {
    const points = await this.makeRequest(
      "POST",
      ENDPOINTS.POINTS,
      { fid: account.fid },
      account
    );
    if (points?.[0]) {
      logger.info(
        `${colors.info}Current points: ${colors.brightWhite}${points[0].Point}${colors.reset}`
      );
    }
    return points;
  }

  async getDailyTasks(account) {
    const tasks = await this.makeRequest(
      "POST",
      ENDPOINTS.DAILY_TASKS,
      { fidId: account.fid, page: 1, limit: 10 },
      account
    );
    logger.info(
      `${colors.info}Found ${tasks?.length || 0} daily tasks${colors.reset}`
    );
    return tasks;
  }

  async getMainTasks(account) {
    const tasks = await this.makeRequest(
      "POST",
      ENDPOINTS.MAIN_TASKS,
      { fidId: account.fid },
      account
    );
    logger.info(
      `${colors.info}Found ${tasks?.length || 0} main tasks${colors.reset}`
    );
    return tasks;
  }

  async clickTask(taskId, taskName, account) {
    const result = await this.makeRequest(
      "POST",
      ENDPOINTS.CLICK_TASK,
      { taskId, fid: account.fid, taskName, clickStatus: null },
      account
    );
    if (result) {
      logger.success(
        `${colors.success}Successfully clicked task: ${taskName}${colors.reset}`
      );
    }
    return result;
  }

  async updateTaskStatus(taskId, account) {
    const response = await this.makeRequest(
      "POST",
      ENDPOINTS.UPDATE_TASK,
      { fidId: account.fid, taskId },
      account
    );
    if (Array.isArray(response) && response.length > 0) {
      const taskInfo = response[0];
      logger.info(
        `${colors.taskInProgress}Task ${taskId} status: ${
          taskInfo.clickStatus === 1 ? "Ready to claim" : "In progress"
        }${colors.reset}`
      );
      return taskInfo;
    }
    return null;
  }

  async updatePoints(taskId, points, account) {
    const response = await this.makeRequest(
      "POST",
      ENDPOINTS.UPDATE_POINTS,
      { taskId, fid: account.fid, point: points },
      account
    );
    return (
      response?.message?.includes("Update point thành công") ||
      response?.message?.includes("Already inserted previously")
    );
  }

  async processTaskList(tasks, account, taskType) {
    let totalPointsGained = 0;
    logger.info(`${colors.info}Processing ${taskType} Tasks${colors.reset}`);

    for (const task of tasks) {
      const {
        taskId,
        taskName,
        point: taskPoints,
        clickStatus,
        claimStatus,
      } = task;

      logger.info(
        `${colors.taskInProgress}Processing task: ${taskName}${colors.reset}`
      );

      if (claimStatus === 1) {
        logger.info(
          `${colors.taskComplete}Task already claimed${colors.reset}`
        );
        continue;
      }

      await this.delay(CONFIG.DELAYS.BETWEEN_REQUESTS);

      const clicked = await this.clickTask(taskId, taskName, account);
      if (clicked) {
        await this.delay(CONFIG.DELAYS.BETWEEN_REQUESTS);

        let shouldClaim = false;
        if (taskType === "daily") {
          const updatedTask = await this.updateTaskStatus(taskId, account);
          shouldClaim = updatedTask?.clickStatus === 1;
        } else {
          shouldClaim = clickStatus === 1 || task.status === 1;
        }

        if (shouldClaim) {
          const pointsUpdated = await this.updatePoints(
            taskId,
            taskPoints || 0,
            account
          );
          if (pointsUpdated) {
            totalPointsGained += taskPoints || 0;
            logger.success(
              `${colors.success}Claimed ${taskPoints || 0} points${
                colors.reset
              }`
            );
          }
        } else {
          logger.warn(
            `${colors.taskWaiting}Task not ready to claim${colors.reset}`
          );
        }

        await this.delay(CONFIG.DELAYS.BETWEEN_TASKS);
      }
    }

    if (totalPointsGained > 0) {
      logger.success(
        `${colors.success}Total points gained from ${taskType} tasks: ${totalPointsGained}${colors.reset}`
      );
    }
  }

  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async processTasks(account) {
    logger.info(`${colors.info}Starting Tasks${colors.reset}`);
    await this.openMagicChest(account);

    const dailyTasks = await this.getDailyTasks(account);
    if (dailyTasks?.length) {
      await this.processTaskList(dailyTasks, account, "daily");
    }

    const mainTasks = await this.getMainTasks(account);
    if (mainTasks?.length) {
      await this.processTaskList(mainTasks, account, "main");
    }

    const points = await this.getPoints(account);
    if (points?.[0]) {
      logger.success(
        `${colors.success}Final points: ${points[0].Point}${colors.reset}`
      );
    }

    logger.info(`${colors.info}Tasks Completed${colors.reset}`);
  }

  async openMagicChest(account) {
    try {
      const result = await this.makeRequest(
        "POST",
        ENDPOINTS.OPEN_MAGIC_CHEST,
        null,
        account
      );

      if (result?.bonus) {
        logger.success(
          `${colors.success}Opened magic chest! Got ${result.bonus} bonus${colors.reset}`
        );
        return;
      }

      logger.info(
        `${colors.info}Magic chest is currently in cooldown${colors.reset}`
      );
    } catch (error) {
      logger.info(
        `${colors.info}Magic chest is currently in cooldown${colors.reset}`
      );
    }
  }

  displayAccountInfo(userInfo, account) {
    logger.info(`${colors.info}Account Information${colors.reset}`);
    logger.info(
      `${colors.info}Account    : ${colors.accountName}Account ${account.index}${colors.reset}`
    );
    logger.info(
      `${colors.info}Username   : ${colors.brightWhite}${userInfo.userName}${colors.reset}`
    );
    logger.info(
      `${colors.info}Proxy      : ${colors.brightWhite}${account.proxyIP || 'No proxy assigned'}${colors.reset}`
    );
  }

  formatTime(ms) {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  async start() {
    displayBanner();
    
    if (!await this.initialize()) {
      logger.error(`${colors.error}Initialization failed, exiting...${colors.reset}`);
      return;
    }

    while (true) {
      for (const account of this.accounts) {
        try {
          logger.info(
            `${colors.info}Processing ${colors.accountName}${account.name}${colors.reset}`
          );

          if (!account.proxy && this.workingProxies.size > 0) {
            const workingProxiesArray = Array.from(this.workingProxies);
            account.proxy = workingProxiesArray[account.index % workingProxiesArray.length];
            account.proxyEnabled = true;
            account.proxyIP = this.proxyIPs.get(account.proxy);
          }

          const loginResponse = await this.checkLoginStatus(account);
          if (!loginResponse) {
            logger.error(
              `${colors.error}Failed to login, skipping...${colors.reset}`
            );
            continue;
          }

          const initialized = await this.initializeAccount(account);
          if (!initialized) {
            logger.error(
              `${colors.error}Failed to initialize, skipping...${colors.reset}`
            );
            continue;
          }

          const userInfo = await this.getUser(account);
          if (userInfo) {
            await this.processTasks(account);
          }

          if (this.accounts.indexOf(account) < this.accounts.length - 1) {
            logger.info(
              `${colors.info}Waiting for next account...${colors.reset}`
            );
            console.log("");
            await CountdownTimer.countdown(
              CONFIG.DELAYS.BETWEEN_ACCOUNTS / 1000,
              {
                message: `${colors.timerCount}Next account in: ${colors.reset}`,
                colors: {
                  message: colors.timerCount,
                  timer: colors.timerWarn,
                  reset: colors.reset,
                },
              }
            );
            console.log("");
          }
        } catch (error) {
          logger.error(
            `${colors.error}Error processing account: ${error.message}${colors.reset}`
          );
        }
      }

      const nextCheck = new Date();
      nextCheck.setHours(24, 0, 0, 0);
      const timeUntilNextCheck = nextCheck - new Date();
      logger.info(`${colors.info}Waiting for next check cycle...${colors.reset}`);
      logger.info(`${colors.info}Next check in: ${this.formatTime(timeUntilNextCheck)}${colors.reset}`);
      await new Promise((resolve) => setTimeout(resolve, timeUntilNextCheck));
    }
  }

  stop() {
    this.isRunning = false;
    process.exit(0);
  }
}

if (!fs.existsSync(CONFIG.COOKIE_FILE)) {
  fs.writeFileSync(CONFIG.COOKIE_FILE, "");
  logger.error(
    `${colors.error}Created data.txt file. Please add one cookie per line.${colors.reset}`
  );
  process.exit(1);
}

const bot = new FarcasterBot();

process.on("SIGINT", async () => {
  bot.stop();
});

bot.start().catch((error) => {
  logger.error(`${colors.error}Fatal error: ${error.message}${colors.reset}`);
});
