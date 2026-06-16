import { analyzeConversationHistory } from './redis-search.js';
import { extractIntent } from './intent-extractor.js';
import { runAgent } from '../ai/agent.js';
import { db } from '../../lib/db.js';
import { kibiEntities, kibiTokenUsage } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
export async function runKibiConversation(input) {
    const history = await analyzeConversationHistory({ sessionKey: input.sessionId, entityId: input.entityContext?.['entityId'] });
    const intent = await extractIntent({ message: input.userMessage, entityId: input.entityContext?.['entityId'] });
    const output = await runAgent(input);
    try {
        await db.insert(kibiTokenUsage).values({
            entityId: input.entityContext?.['entityId'],
            userId: input.tenantId,
            modelName: output.usedModel ?? 'unknown',
            provider: 'openrouter',
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            costUsd: '0',
            modelRole: 'conversation',
        });
    }
    catch (error) {
        console.warn('Kibi token usage kayıt hatası:', error);
    }
    if (input.entityContext?.['entityId']) {
        await db.update(kibiEntities).set({
            mood: intent.mood,
            lastContactAt: new Date(),
        }).where(eq(kibiEntities.entityId, input.entityContext['entityId']));
    }
    return output;
}
//# sourceMappingURL=conversation.js.map