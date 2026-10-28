// This integration stage has no operational notification authorization.
// No environment switch can enable a real provider or a background sender.
export function refuseRealNotificationDelivery() {
  throw new Error("Real notification delivery disabled during integration: DRY_RUN");
}
