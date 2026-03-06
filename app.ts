import 'dotenv/config';
import * as api from '@actual-app/api';
import { generateObject } from 'ai';
import { createOllama } from 'ollama-ai-provider';
import { z } from 'zod';
import cron from 'node-cron';

// 1. Initialize Ollama
const ollamaProvider = createOllama({
  baseURL: (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434') + '/api',
});

const CategorySchema = z.object({
  categoryId: z.string(),
  reason: z.string(),
  confidence: z.number()
});

async function categorize(payee: string, menu: string) {
  try {
    const { object } = await generateObject({
      model: ollamaProvider(process.env.AI_MODEL || 'mistral-nemo'),
      schema: CategorySchema,
      system: `You are a professional bookkeeper. Categorize the merchant using the provided MENU.
      - Speedway/Shell/BP -> Gas/Fuel IDs
      - Walmart/Target/Amazon -> Shopping/Groceries IDs
      - Ulta/Sephora -> Personal Care/Cosmetics IDs
      MENU:
      ${menu}`,
      prompt: `Categorize: "${payee}"`,
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
    const aiClassify = (categories as any[]).find(c => c.name === 'AI-Classify');
    const menu = (categories as any[])
      .filter(c => !c.is_group && !c.tombstone)
      .map(c => `${c.name} [ID: ${c.id}]`)
      .join('\n');

    const accounts = await api.getAccounts();
    for (const account of accounts) {
      if (account.offbudget) continue;

      const transactions = await api.getTransactions(account.id, '2025-01-01', '2099-12-31');
      
      // TRIGGER: Blank OR assigned to 'AI-Classify'
      const toProcess = transactions.filter(t => 
        (!t.category && !t.is_parent) || (aiClassify && t.category === aiClassify.id)
      );

      for (const t of toProcess) {
        const tx = t as any;
        const rawPayee = tx.payee_name || tx.imported_payee || 'Unknown';
        
        // PAYEE CLEANER: Remove dates (03/05), large numbers (123456), and bank keywords
        const cleanPayee = rawPayee
          .replace(/\d{2,}\/\d{2,}/g, '') // Dates
          .replace(/\d{4,}/g, '')         // Long IDs
          .replace(/\b(PURCHASE|AUTH|ON|DEBIT|CARD|XX)\b/gi, '') // Keywords
          .trim();

        const result = await categorize(cleanPayee, menu);
        
        if (result && result.categoryId) {
          const currentNotes = (t.notes || '').replace('#review', '').trim();
          
          const isHighConfidence = result.confidence > 85;
          const statusNote = isHighConfidence ? '✅ Worked' : '❓ #review';
          const newNote = `${currentNotes} | ${statusNote}: ${result.reason}`.trim();

          // FIX: Cast to any to bypass TS2353 'flagged' error
          await api.updateTransaction(t.id, { 
            category: result.categoryId,
            notes: newNote,
            flagged: !isHighConfidence, 
          } as any);
          
          console.log(`${isHighConfidence ? '✅' : '❓'} ${cleanPayee} -> ${result.categoryId}`);
        }
      }
    }
    await api.shutdown();
  } catch (e: any) {
    console.error(`[Sync Error]: ${e.message}`);
  }
}

cron.schedule(process.env.CRON_SCHEDULE || '0 */4 * * *', () => { sync(); });
sync();
