import '../src/lib/env.js';
import { PrismaClient, Variant, TaskKind, TaskState } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

const BUSINESSES = [
  "Apex Auto Repair", "Bella's Bakery", "Cedar Creek Plumbing", "Downtown Diner",
  "Elite Fitness Studio", "Frontier Landscaping", "Golden Gate Dental", "Harbor View Realty",
  "Island Breeze Spa", "Junction Coffee House", "Kings County Roofing", "Lakeside Pet Clinic",
  "Maple Street Accounting", "Northern Lights Photography", "Oak Park Florist",
  "Pacific Rim Sushi", "Quality Heating & Air", "Riverside Family Chiropractic",
  "Sunrise Yoga Studio", "Timber Trail Construction", "Urban Grill & Bar",
  "Valley Fresh Produce", "Westside Tire & Auto", "Xpress Dry Cleaning",
  "Yellowstone Hardware", "Zenith Marketing Group", "Artisan Bread Co",
  "Blue Moon Tattoo", "Capital City Locksmith", "Diamond Dog Grooming",
  "Eagle Eye Security", "Four Seasons Catering", "Green Thumb Nursery",
  "Highpoint Electrical", "Ironwood Custom Furniture", "Jade Garden Restaurant",
  "Keystone Pharmacy", "Liberty Tax Services", "Modern Maid Cleaning",
  "Northside Veterinary", "Olympia Pool & Spa", "Pinnacle Insurance Agency",
  "Quick Lube Express", "Red Rock Painting", "Solstice Brewing Company",
  "Thornberry Law Office", "Umbrella IT Solutions", "Victory Sports Bar",
  "Wildwood Childcare", "Yellow Cab Taxi"
];

function assignVariant(email: string): Variant {
  const hash = createHash('sha256').update(email).digest('hex');
  const bucket = parseInt(hash.slice(0, 8), 16) % 2;
  return bucket === 0 ? Variant.A : Variant.B;
}

type AdvertiserProfile = 'completed' | 'coupon_only' | 'in_progress' | 'stuck' | 'dlq';

function pickProfile(index: number): AdvertiserProfile {
  if (index < 10) return 'completed';
  if (index < 20) return 'coupon_only';
  if (index < 32) return 'in_progress';
  if (index < 43) return 'stuck';
  return 'dlq';
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

interface TaskDef {
  kind: TaskKind;
  delayHours: number;
  conditional: boolean;
}

const VARIANT_A_TASKS: TaskDef[] = [
  { kind: TaskKind.WELCOME_EMAIL, delayHours: 0, conditional: false },
  { kind: TaskKind.ACCOUNT_SETUP_NUDGE, delayHours: 24, conditional: false },
  { kind: TaskKind.FIRST_COUPON_DESIGN_NUDGE, delayHours: 72, conditional: false },
  { kind: TaskKind.DAY_3_CHECK_IN, delayHours: 96, conditional: true },
  { kind: TaskKind.DAY_7_SALES_HANDOFF, delayHours: 168, conditional: true },
];

const VARIANT_B_TASKS: TaskDef[] = [
  { kind: TaskKind.WELCOME_EMAIL, delayHours: 0, conditional: false },
  { kind: TaskKind.FIRST_COUPON_DESIGN_NUDGE, delayHours: 24, conditional: false },
  { kind: TaskKind.DAY_3_CHECK_IN, delayHours: 72, conditional: true },
];

async function main(): Promise<void> {
  console.log('Seeding 50 advertisers...');

  await prisma.task.deleteMany();
  await prisma.advertiser.deleteMany();

  for (let i = 0; i < 50; i++) {
    const businessName = BUSINESSES[i] ?? `Business ${i + 1}`;
    const email = `advertiser${i + 1}@example.com`;
    const variant = assignVariant(email);
    const profile = pickProfile(i);
    const signedUpAt = daysAgo(14 - Math.floor(i / 4));

    let firstCouponAt: Date | null = null;
    let firstPublishAt: Date | null = null;

    if (profile === 'completed') {
      firstCouponAt = new Date(signedUpAt.getTime() + 48 * 60 * 60 * 1000);
      firstPublishAt = new Date(signedUpAt.getTime() + 120 * 60 * 60 * 1000);
    } else if (profile === 'coupon_only') {
      firstCouponAt = new Date(signedUpAt.getTime() + 60 * 60 * 60 * 1000);
    }

    const advertiser = await prisma.advertiser.create({
      data: { businessName, email, signedUpAt, variant, firstCouponAt, firstPublishAt },
    });

    const taskDefs = variant === Variant.A ? VARIANT_A_TASKS : VARIANT_B_TASKS;

    for (const def of taskDefs) {
      const scheduledFor = new Date(signedUpAt.getTime() + def.delayHours * 60 * 60 * 1000);
      const isInPast = scheduledFor < new Date();

      let state: TaskState = TaskState.PENDING;
      let completedAt: Date | null = null;
      let lastError: string | null = null;
      let attempts = 0;

      if (isInPast) {
        if (profile === 'completed' || profile === 'coupon_only') {
          state = TaskState.COMPLETED;
          completedAt = hoursAgo(Math.floor(Math.random() * 48));
        } else if (profile === 'in_progress') {
          const rand = Math.random();
          if (rand < 0.6) {
            state = TaskState.COMPLETED;
            completedAt = hoursAgo(Math.floor(Math.random() * 72));
          } else {
            state = TaskState.PENDING;
          }
        } else if (profile === 'stuck') {
          const rand = Math.random();
          if (rand < 0.4) {
            state = TaskState.COMPLETED;
            completedAt = hoursAgo(Math.floor(Math.random() * 96));
          } else if (rand < 0.7) {
            state = TaskState.FAILED;
            attempts = 2;
            lastError = 'Connection timeout after 5000ms';
          } else {
            state = TaskState.PENDING;
          }
        } else if (profile === 'dlq') {
          const rand = Math.random();
          if (rand < 0.3) {
            state = TaskState.COMPLETED;
            completedAt = hoursAgo(Math.floor(Math.random() * 24));
          } else {
            state = TaskState.DEAD_LETTER;
            attempts = 3;
            lastError = 'Max retries exceeded: external service unavailable';
          }
        }
      }

      await prisma.task.create({
        data: {
          advertiserId: advertiser.id,
          kind: def.kind,
          scheduledFor,
          state,
          completedAt,
          attempts,
          lastError,
        },
      });
    }
  }

  const counts = await prisma.task.groupBy({ by: ['state'], _count: { state: true } });
  const advertiserCount = await prisma.advertiser.count();

  console.log(`Seeded ${advertiserCount} advertisers`);
  counts.forEach((c) => console.log(`  ${c.state}: ${c._count.state} tasks`));
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
