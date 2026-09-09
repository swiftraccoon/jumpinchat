import mongoose from 'mongoose';
import { videoQuality } from '../constants/constants.js';

const { Schema, model } = mongoose;

/**
 * User Model
 * ==========
 */
const userSchema = new Schema({
  username: String,
  attrs: {
    join_date: { type: Date, default: Date.now },
    modified: { type: Date, default: Date.now },
    last_active: { type: Date, default: Date.now },
    join_ip: { type: String },
    last_login_ip: String,
    userLevel: { type: Number, default: 0 },
    ageVerified: { type: Boolean, default: false },
    isSupporter: { type: Boolean, default: false },
    isGold: { type: Boolean, default: false },
    supportExpires: { type: Date, default: null },
    appliedCheckoutSessions: { type: [String], default: undefined, select: false },
  },
  settings: {
    playYtVideos: { type: Boolean, default: true },
    allowPrivateMessages: { type: Boolean, default: true },
    pushNotificationsEnabled: { type: Boolean, default: true },
    receiveMessageNotifications: { type: Boolean, default: true },
    receiveUpdates: { type: Boolean, default: false },
    darkTheme: { type: Boolean, default: false },
    videoQuality: { type: String, default: videoQuality.VIDEO_240.id },
    ignoreList: [
      {
        id: String,
        handle: String,
        timestamp: Date,
        expiresAt: Date,
        userListId: Schema.Types.ObjectId,
        userId: { type: Schema.Types.ObjectId, default: null },
        sessionId: String,
      },
    ],
    userIcon: { type: String, default: null },
  },
  auth: {
    email: String,
    email_is_verified: { type: Boolean, default: false },
    passhash: String,
    joinFingerprint: { type: String, default: null },
    latestFingerprint: { type: String, default: null },
    fingerprintVersion: { type: String, default: null },
    fingerprintHistory: [{ _id: false, value: String, version: String }],
    totpSecret: { type: String, default: null },
  },
  trophies: [
    {
      trophyId: { type: Schema.Types.ObjectId, ref: 'Trophy' },
      awarded: { type: Date, default: Date.now },
    },
  ],
  profile: {
    bio: { type: String, default: null },
    dob: {
      month: { type: Number, default: null },
      day: { type: Number, default: null },
    },
    location: { type: String, default: null },
    pic: { type: String, default: null },
  },
});

// Internal fulfillment markers must never be returned with a user document.
function hidePaymentMarkers(_document, value) {
  if (value.attrs) delete value.attrs.appliedCheckoutSessions;
  return value;
}
userSchema.set('toJSON', { transform: hidePaymentMarkers });
userSchema.set('toObject', { transform: hidePaymentMarkers });

export default model('User', userSchema);
