import gmail from "gmail-tester";
import path from "path";
(async () => {
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

	if (!email) return console.log("Email not found");
	console.log(email[0].date.toString());
})();
