import { extensionVariables, SubscriptionSession } from "../model/models";

export function getSubscriptionSession(subscriptionId: string): SubscriptionSession {
    let currentSubscription: SubscriptionSession = extensionVariables.azureAccountExtensionApi.subscriptions
        .find((subscription: SubscriptionSession) =>
            subscription.subscription.subscriptionId.toLowerCase() === subscriptionId.toLowerCase());

    // Fallback to first element
    if (!currentSubscription) {
        currentSubscription = extensionVariables.azureAccountExtensionApi.subscriptions[0];
    }

    return currentSubscription;
}