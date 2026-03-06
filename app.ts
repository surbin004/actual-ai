import 'dotenv/config';
import * as api from '@actual-app/api';
import { generateObject } from 'ai';
import { createOllama } from 'ollama-ai-provider';
import { z } from 'zod';
import cron from 'node-cron';

// Initialize Ollama using Sanitized Environment Variable
const ollamaProvider = createOllama({
  baseURL: (process.env.OLLAMA_BASE_URL || 'http://YOUR-OLLAMA-IP:11434') + '/api',
});

const CategorySchema = z.object({
  intent: z.enum(['spend', 'transfer']),
  targetAccountId: z.string().optional(),
  categoryId: z.string().optional(),
  reason: z.string(),
  confidence: z.number()
});

async function categorize(payee: string, menu: string, accounts: string) {
  try {
    const { object } = await generateObject({
      model: ollamaProvider(process.env.AI_MODEL || 'mistral-nemo'),
      schema: CategorySchema,
      system: `You are a professional bookkeeper. 
      1. Identify if a transaction is a SPEND or a TRANSFER.
      2. If TRANSFER, pick the TARGET ACCOUNT ID from: ${accounts}.
      3. If SPEND, pick the CATEGORY ID from: ${menu}.
      4. Mentally clean the payee to find the merchant.`,
      prompt: `Analyze: "${payee}"`,
      temperature: 0,
    });
    return object;
  } catch (error: any) {
    console.error(`[AI Error]: ${error.message}`);
    return null;
  }
}

async function sync() {
  console.log('\n🔄 Starting Actual Budget AI Sync...');
  try {
    await api.init({
      dataDir: './data',
      serverURL: process.env.ACTUAL_SERVER_URL!,
      password: process.env.ACTUAL_SERVER_PASSWORD || process.env.ACTUAL_PASSWORD!,
    });

    await api.downloadBudget(process.env.ACTUAL_BUDGET_ID!);
    
    const categories = await api.getCategories();
    const accounts = await api.getAccounts();
    const payees = await api.getPayees();
    const aiClassify = (categories as any[]).find(c => c.name === 'AI-Classify');

    const menu = (categories as any[]).filter(c => !c.is_group && !c.tombstone).map(c => `${c.name} [ID: ${c.id}]`).join('\n');
    const accList = accounts.map(a => `${a.name} [ID: ${a.id}]`).join('\n');

    for (const account of accounts) {
      if (account.offbudget) continue;

      const transactions = await api.getTransactions(account.id, '2025-01-01', '2099-12-31');
      const toProcess = transactions.filter(t => (!t.category && !t.transfer_id && !t.is_parent) || (aiClassify && t.category === aiClassify.id));

      for (const t of toProcess) {
        const tx = t as any;
        const rawPayee = tx.payee_name || tx.imported_payee || 'Unknown';
        const cleanPayee = rawPayee.replace(/\d{4,}/g, '').replace(/\b(PURCHASE|AUTH|ON|DEBIT|CARD|XX)\b/gi, '').trim();

        const result = await categorize(cleanPayee, menu, accList);
        
        if (result) {
          // --- MIRROR-STRICT TRANSFER LINKING ---
          if (result.intent === 'transfer' && result.targetAccountId) {
            const dateObj = new Date(t.date);
            const start = new Date(new Date(dateObj).setDate(dateObj.getDate() - 2)).toISOString().split('T')[0];
            const end = new Date(new Date(dateObj).setDate(dateObj.getDate() + 2)).toISOString().split('T')[0];

            const otherTransactions = await api.getTransactions(result.targetAccountId, start, end);
            // LOCK: Strict Mirror Amount + Uncategorized + Different Record
            const match = otherTransactions.find(ot => (ot.amount === -t.amount) && (ot.id !== t.id) && (!ot.category && !ot.transfer_id));

            if (match) {
              const transferPayee = payees.find(p => p.transfer_acct === result.targetAccountId);
              if (transferPayee) {
                 await api.updateTransaction(t.id, { payee: transferPayee.id } as any);
                 console.log(`🔗 LINKED: ${cleanPayee} matched mirror in target account.`);
                 continue;
              }
            }
          }

          // --- SPENDING ---
          if (result.intent === 'spend' && result.categoryId) {
            const currentNotes = (t.notes || '').replace('#ai-review', '').replace('#ai-worked', '').trim();
            const tag = result.confidence > 85 ? '#ai-worked' : '#ai-review';
            await api.updateTransaction(t.id, { 
              category: result.categoryId,
              notes: `${currentNotes} [${tag}]: ${result.reason}`.trim()
            } as any);
            console.log(`${result.confidence > 85 ? '✅' : '❓'} ${cleanPayee} -> ID: ${result.categoryId}`);
          }
        }
      }
    }
    await api.shutdown();
    console.log('🏁 Sync complete.\n');
  } catch (e: any) {
    console.error(`[Sync Error]: ${e.message}`);
  }
}

cron.schedule(process.env.CRON_SCHEDULE || '0 */4 * * *', () => { sync(); });
sync();
