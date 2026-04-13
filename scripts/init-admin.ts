#!/usr/bin/env node
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import readline from 'readline'

const prisma = new PrismaClient()

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

function question(query: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(query, resolve)
  })
}

async function main() {
  console.log('🚀 waoowaoo Admin Initialization')
  console.log()

  // Check if admin already exists
  const existingAdmin = await prisma.user.findFirst({
    where: { role: 'admin' },
  })

  if (existingAdmin) {
    console.log('✅ Admin already exists in database. Exiting.')
    process.exit(0)
  }

  console.log('No admin found. Let\'s create the first admin account.')
  console.log()

  const username = await question('Enter admin username: ')
  if (!username || username.trim().length === 0) {
    console.error('❌ Username cannot be empty')
    process.exit(1)
  }

  const password = await question('Enter admin password: ')
  if (!password || password.trim().length < 6) {
    console.error('❌ Password must be at least 6 characters')
    process.exit(1)
  }

  const initialBalanceStr = await question('Enter initial balance (default 0): ')
  const initialBalance = parseFloat(initialBalanceStr || '0') || 0

  console.log()
  console.log('Creating admin...')

  const hashedPassword = await bcrypt.hash(password, 12)

  await prisma.$transaction(async tx => {
    // Create admin user
    const admin = await tx.user.create({
      data: {
        name: username.trim(),
        password: hashedPassword,
        role: 'admin',
        isDisabled: false,
      },
    })

    // Create user balance
    await tx.userBalance.create({
      data: {
        userId: admin.id,
        balance: initialBalance,
        frozenAmount: 0,
        totalSpent: 0,
      },
    })

    // Initialize system config
    await tx.systemConfig.create({
      data: {},
    })
  })

  console.log()
  console.log(`✅ Admin account "${username}" created successfully!`)
  console.log()
  console.log('You can now login with this admin account.')
}

main()
  .catch(e => {
    console.error('❌ Error creating admin:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    rl.close()
  })
