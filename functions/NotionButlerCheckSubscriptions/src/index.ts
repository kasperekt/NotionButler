// main.ts
import { isFullPage } from "@notionhq/client";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { EventBridgeHandler } from "aws-lambda";
import { getNotionClient, getDatabaseId } from "notion-butler-shared";
import * as config from "./config";

// AWS region should be consistent and configurable
const AWS_REGION = process.env.AWS_REGION || "eu-central-1";

interface Subscription {
	id: string;
	name: string;
	nextPayment: string;
	amount: number;
	cadence: typeof config.CADENCE_MAP[keyof typeof config.CADENCE_MAP];
}

async function getDueSubscriptions(): Promise<Subscription[]> {
	const notion = await getNotionClient();
	const databaseId = await getDatabaseId("Personal/SubscriptionsDatabase");
	
	const today = new Date();
	today.setHours(1, 0, 0);

	const response = await notion.databases.query({
		database_id: databaseId,
		filter: {
			property: config.PROPERTIES.NEXT_PAYMENT,
			date: {
				equals: today.toISOString().split("T")[0],
			},
		},
	});

	return response.results.map((page) => {
		if (!isFullPage(page)) {
			throw new Error("Unexpected object type");
		}

		const maybeTitleProperty = page.properties[config.PROPERTIES.NAME];
		const maybeDateProperty = page.properties[config.PROPERTIES.NEXT_PAYMENT];
		const maybeAmountProperty = page.properties[config.PROPERTIES.AMOUNT];
		const maybeCadenceProperty = page.properties[config.PROPERTIES.CADENCE];

		const titleProperty =
			maybeTitleProperty.type === "title"
				? maybeTitleProperty
				: null;

		const dateProperty =
			maybeDateProperty.type === "date"
				? maybeDateProperty
				: null;

		const priceProperty =
			maybeAmountProperty.type === "number"
				? maybeAmountProperty
				: null;

		const cadenceProperty =
			maybeCadenceProperty.type === "select"
				? maybeCadenceProperty
				: null;

		const cadenceValue = config.CADENCE_MAP[cadenceProperty?.select?.name as keyof typeof config.CADENCE_MAP];

		return {
			id: page.id,
			name: titleProperty?.title[0]?.plain_text ?? "Unnamed Subscription",
			nextPayment: dateProperty?.date?.start ?? "n/a",
			amount: priceProperty?.number ?? 0,
			cadence: cadenceValue,
		};
	});
}

async function sendNotification(subscriptions: Subscription[]) {
	if (subscriptions.length === 0) return;

	const totalAmount = subscriptions.reduce((sum, sub) => sum + sub.amount, 0);
	const message = `
*🔔 Subscription Payments Due Today:*

${subscriptions.map((sub) => `• ${sub.name}: *${sub.amount} PLN*`).join("\n")}

*Total: ${totalAmount} PLN*
`;

	try {
		const lambdaClient = new LambdaClient({ region: AWS_REGION });
		const command = new InvokeCommand({
			FunctionName: "TelegramSendNotification",
			InvocationType: "Event",
			Payload: JSON.stringify({ text: message }),
		});
		await lambdaClient.send(command);
		console.log("Notification sent successfully");
	} catch (error) {
		console.error("Error sending notification:", error);
		throw error; // Re-throw to be caught by the main handler
	}
}

async function updateNextPaymentDate(subscription: Subscription) {
	const notion = await getNotionClient();
	
	// Calculate next payment date based on subscription frequency
	const currentDate = new Date(subscription.nextPayment);
	let nextPaymentDate;

	if (subscription.cadence === "monthly") {
		nextPaymentDate = new Date(currentDate.setMonth(currentDate.getMonth() + 1));
	} else if (subscription.cadence === "yearly") {
		nextPaymentDate = new Date(currentDate.setFullYear(currentDate.getFullYear() + 1));
	} else {
		throw new Error(`Unsupported cadence: ${subscription.cadence}`);
	}

	await notion.pages.update({
		page_id: subscription.id,
		properties: {
			[config.PROPERTIES.NEXT_PAYMENT]: {
				date: {
					start: nextPaymentDate.toISOString().split("T")[0],
				},
			},
		},
	});
}

export const handler: EventBridgeHandler<"Scheduled Event", any, void> = async (event) => {
	try {
		console.log("Processing subscription checks", { event });
		
		// Get subscriptions due today
		const dueSubscriptions = await getDueSubscriptions();
		console.log(`Found ${dueSubscriptions.length} subscriptions due today`);
		
		// Update next payment dates
		for (const subscription of dueSubscriptions) {
			await updateNextPaymentDate(subscription);
			console.log(`Updated next payment date for ${subscription.name}`);
		}
		
		// Send notification if there are any due subscriptions
		if (dueSubscriptions.length > 0) {
			await sendNotification(dueSubscriptions);
		}
		
		console.log("Subscription check completed successfully");
	} catch (error) {
		console.error("Error processing subscriptions:", error);
		throw error; // Re-throw to ensure AWS Lambda detects the failure
	}
}