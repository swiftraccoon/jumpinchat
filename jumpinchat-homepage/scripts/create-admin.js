import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import User from '../models/User.js';

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost/tc';

const [,, username, email, password] = process.argv;
if (!username || !email || !password) {
  console.error('Usage: node scripts/create-admin.js <username> <email> <password>');
  process.exit(1);
}

await mongoose.connect(mongoUri);

const passhash = await bcrypt.hash(password, 10);
const result = await User.updateOne(
  { 'auth.email': email },
  {
    $set: {
      username,
      'auth.email': email,
      'auth.passhash': passhash,
      'attrs.userLevel': 30,
    },
    $setOnInsert: {
      'attrs.join_date': new Date(),
    },
  },
  { upsert: true },
);

if (result.upsertedCount > 0) {
  console.log(`Admin user "${username}" (${email}) created`);
} else {
  console.log(`Admin user "${username}" (${email}) updated`);
}

await mongoose.disconnect();
