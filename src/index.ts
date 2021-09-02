process.env.NTBA_FIX_319 = "1";

import "dotenv/config";
import { CronJob } from "cron";
import download from "download";
import fs from "fs-extra";
import gmail from "gmail-tester";
import TelegramBot from "node-telegram-bot-api";
import path from "path";
import table from "text-table";
import xls from "xls-to-json";

type Config = {
	access: string; // last email accessed time
	groups: Array<number>;
	channel: string;
	latest: string;
};

const sleep = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
	if (!process.env.BotToken) throw new Error("Bot token not found");
	const bot = new TelegramBot(process.env.BotToken as string, { polling: true });
	console.log(`[Bot] Up and running..`);

	const saveConfig = async () => fs.writeJSONSync("config.json", config);

	const checkEmail = async () => {
		try {
			const email = await gmail.check_inbox(
				path.resolve(__dirname, "..", "data", "credentials.json"),
				path.resolve(__dirname, "..", "data", "token.json"),
				{
					subject: "ARK Investment Management LLC – Actively Managed ETFs - Daily Trade Information",
					from: "ark@ark-funds.com",
					to: "kingofxiaomi@gmail.com",
					wait_time_sec: 10,
					max_wait_time_sec: 20,
					include_body: true,
				}
			);

			if (!email) {
				console.log(`> email not found`);
				return bot.sendMessage(8925075, "Email not found");
			}

			console.log(config.access, email[0].date.toString());
			if (config.access === email[0].date.toString()) {
				console.log(`> Ignoring same email ${config.access}`);
				return bot.sendMessage(8925075, `Ignoring same email`);
			}

			config.access = email[0].date.toString();
			await saveConfig();

			const body = email[0].body.html.toString().replace(/[\r\n]+/g, "");
			const match = /href="(.*?)">.*?<u>Download/g.exec(body);
			if (!match) {
				console.log(`> download link not found`);
				return bot.sendMessage(8925075, "Download link not found");
			}

			console.log(`> download link: ${match[1]}`);
			await download(match[1], ".", {
				filename: "1.xls",
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36",
				},
			});

			xls(
				{
					input: "1.xls",
					output: null,
					sheet: "Sheet1",
					rowsToSkip: 3,
					allowEmptyKey: false,
				},
				async (err: any, result: any) => {
					if (err) {
						console.log(`> xls erorr: ${err}`);
						return bot.sendMessage(8925075, err);
					}

					const date = result[0].Date;
					const vals = result
						.map((val: any) => [
							val["FUND"],
							`${val["Direction"] === "Buy" ? "+" : "-"}${val["Ticker"]}`,
							val["Shares"],
							`${val["% of ETF"]}%`,
						])
						.filter((p: Array<string>) => p[0].startsWith("ARK"));

					if (vals[vals.length - 1][0].length < 1) vals.splice(-1, 1);
					fs.rmSync("1.xls");
					const str = `\`\`\`\n${date}\n${table(vals)}\`\`\``;
					config.latest = str;
					await saveConfig();
					for (const rm of config.groups) {
						await sleep(500);
						await bot.sendMessage(rm, str, {
							parse_mode: "Markdown",
						});
					}

					await bot.sendMessage(`@${config.channel}`, str, {
						parse_mode: "Markdown",
					});

					await sleep(1000);
					await bot.sendMessage(8925075, `Done. Next email at ${job.nextDate().toLocaleString()}`);
				}
			);
		} catch (error) {
			console.error(error)
			return bot.sendMessage(8925075, JSON.stringify(error));
		}
	};

	let config: Config;
	if (fs.existsSync("config.json")) config = fs.readJSONSync("config.json");
	else config = { access: "", groups: [], channel: "arkfunds", latest: "" };

	bot.onText(/\/check/, async (msg) => {
		const chatId = msg.chat.id;
		if (chatId !== 8925075) return;
		return await bot.sendMessage(8925075, job.nextDate().toISOString());
	});

	bot.onText(/\/latest/, async (msg) => {
		if (config.latest.length < 1) return;
		return await bot.sendMessage(msg.chat.id, config.latest, {
			parse_mode: "Markdown",
		});
	});

	bot.onText(/\/subscribe/, async (msg) => {
		const chatId = msg.chat.id;
		if (!config.groups.includes(chatId)) {
			await bot.sendMessage(chatId, "Subscribed to ARK funds transactions");
			config.groups.push(chatId);
			await saveConfig();
		} else await bot.sendMessage(chatId, "Already subscribed");
	});

	bot.onText(/\/force/, async (msg) => {
		const chatId = msg.chat.id;
		if (chatId !== 8925075) return;
		await checkEmail();
	});

	const job = new CronJob("0 0 * * * *", async () => await checkEmail(), null, true, "Asia/Singapore");
	job.start();
	await bot.sendMessage(8925075, `Waiting for next job at ${job.nextDate().toISOString()}`);
	await checkEmail();
})();
