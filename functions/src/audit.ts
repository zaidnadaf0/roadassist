import * as admin from 'firebase-admin';

export type AuditTarget = 'user' | 'mechanic' | 'request' | 'system';

export interface AuditInput {
  actorUid: string;
  action: string;
  targetType: AuditTarget;
  targetId: string;
  metadata?: Record<string, string | number | boolean | null>;
}

/** Server-only immutable operator event. Admin SDK bypasses client rules. */
export async function writeAuditEvent(db: admin.firestore.Firestore, input: AuditInput): Promise<void> {
  const ref = db.collection('auditEvents').doc();
  await ref.set({
    actorUid: input.actorUid,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    ...(input.metadata ? { metadata: input.metadata } : {}),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}
