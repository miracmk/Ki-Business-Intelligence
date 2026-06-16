import { redis, redisKeys } from '../../lib/redis.js';
import { defaultGateway } from '../ai/gateway.js';
import { getModelChain } from './models.js';
export async function analyzeConversationHistory(params) {
    const rawMessages = await redis.lrange(redisKeys.sessionMessages(params.sessionKey), -20, -1);
    const history = rawMessages.map((item) => {
        try {
            return JSON.parse(item);
        }
        catch {
            return null;
        }
    }).filter(Boolean).map((msg) => `${msg.role}: ${msg.content}`).join('\n');
    const systemPrompt = `Sen bir konuşma geçmişi analiz uzmanısın. Aşağıdaki sohbet geçmişini özetle, ruh halini belirle, önerilen tonu ver ve ana başlıkları JSON olarak döndür.`;
    const userPrompt = `Sohbet geçmişi:\n${history}`;
    const chain = await getModelChain('redis_search', params.entityId);
    const result = await defaultGateway.completeWithFallback([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
    ], chain, {
        temperature: 0.3,
        maxTokens: 500,
    });
    try {
        const parsed = JSON.parse(result.content || '{}');
        return {
            summary: String(parsed.summary ?? 'Özet bulunamadı.'),
            lastMood: String(parsed.lastMood ?? parsed.mood ?? 'neutral'),
            recommendedTone: String(parsed.recommendedTone ?? 'normal'),
            keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics.slice(0, 5) : [],
        };
    }
    catch {
        return {
            summary: history.slice(0, 300),
            lastMood: 'neutral',
            recommendedTone: 'normal',
            keyTopics: [],
        };
    }
}
//# sourceMappingURL=redis-search.js.map