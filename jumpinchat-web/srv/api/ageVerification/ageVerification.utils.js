
import config from '../../config/env/index.js';
import { statuses } from './ageVerification.const.js';
import AgeVerificationModel from './ageVerification.model.js';
export function findById(id) {
  return AgeVerificationModel
    .findOne({
      _id: id,
    })
    .exec();
};

export function getRequests() {
  return AgeVerificationModel
    .find()
    .exec();
};

export function getRequestsByUser(userId) {
  return AgeVerificationModel
    .find({
      status: { $eq: statuses.PENDING },
      user: userId,
      expiresAt: { $gt: new Date() },
    })
    .sort({ updatedAt: -1 })
    .exec();
};

export function findRecentDeniedRequests(userId) {
  return AgeVerificationModel
    .find({
      status: statuses.DENIED,
      user: userId,
      updatedAt: { $gt: Date.now() - config.ageVerification.deniedTimeout },
    })
    .sort({ updatedAt: -1 })
    .exec();
};
