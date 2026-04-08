#!/bin/sh
set -e

echo "Running database migrations..."

# Try migrate deploy — if P3005 (existing DB with no migration history), baseline first
if ! npx prisma migrate deploy 2>&1; then
  echo "Migration failed — baselining existing database..."
  npx prisma migrate resolve --applied 20260201200407_init
  npx prisma migrate resolve --applied 20260216125511_add_quotation_signature
  npx prisma migrate resolve --applied 20260226120000_add_mission_from_appointment
  npx prisma migrate resolve --applied 20260226130000_chat_message_types_and_conversation_mission
  npx prisma migrate resolve --applied 20260316000000_rename_manager_to_agent
  echo "Baseline complete. Running migrate deploy..."
  npx prisma migrate deploy
fi

echo "Starting application..."
exec node dist/main
