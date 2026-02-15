import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

describe('verify.utils', () => {
  let createEmailVerification;
  let createPasswordReset;
  let verifyModelStub;
  let emailStub;
  let signUpTemplateStub;
  let resetPasswordTemplateStub;

  const logStub = () => ({
    debug: sinon.stub(),
    info: sinon.stub(),
    warn: sinon.stub(),
    error: sinon.stub(),
    fatal: sinon.stub(),
  });

  beforeEach(async () => {
    verifyModelStub = {
      findOneAndDelete: sinon.stub().resolves(),
      create: sinon.stub(),
    };

    emailStub = {
      sendMail: sinon.stub().callsFake((msg, cb) => cb(null)),
    };

    signUpTemplateStub = sinon.stub().returns('<html>signup</html>');
    resetPasswordTemplateStub = sinon.stub().returns('<html>reset</html>');

    const mod = await esmock('./verify.utils.js', {
      'uuid': { v4: () => 'mock-uuid-v4' },
      '../../utils/logger.util.js': { default: logStub },
      '../../config/env/index.js': {
        default: {
          verification: {
            emailTimeout: 3600000,
            pwResetTimeout: 3600000,
          },
        },
      },
      './verify.model.js': { default: verifyModelStub },
      '../../config/email.config.js': { default: emailStub },
      '../../config/constants/emailTemplates.js': {
        signUpTemplate: signUpTemplateStub,
        resetPasswordTemplate: resetPasswordTemplateStub,
      },
    });

    createEmailVerification = mod.createEmailVerification;
    createPasswordReset = mod.createPasswordReset;
  });

  describe('createEmailVerification', () => {
    const mockUser = {
      _id: 'user123',
      username: 'testuser',
      auth: { email: 'test@example.com' },
    };

    it('should delete any existing email verification entry for the user', async () => {
      verifyModelStub.create.resolves({ token: 'abc123' });

      await createEmailVerification(mockUser, () => {});

      expect(verifyModelStub.findOneAndDelete.calledOnce).to.equal(true);
      expect(verifyModelStub.findOneAndDelete.firstCall.args[0]).to.deep.equal({
        userId: 'user123',
        type: 'email',
      });
    });

    it('should create a new verification entry with correct type', async () => {
      verifyModelStub.create.resolves({ token: 'abc123' });

      await createEmailVerification(mockUser, () => {});

      expect(verifyModelStub.create.calledOnce).to.equal(true);
      const createArg = verifyModelStub.create.firstCall.args[0];
      expect(createArg.userId).to.equal('user123');
      expect(createArg.type).to.equal('email');
      expect(createArg.token).to.be.a('string');
      expect(createArg.token).to.have.lengthOf(64); // sha256 hex digest
      expect(createArg.expireDate).to.be.an.instanceOf(Date);
    });

    it('should send email to user with signup template', async () => {
      verifyModelStub.create.resolves({ token: 'generated-token' });

      await createEmailVerification(mockUser, () => {});

      expect(emailStub.sendMail.calledOnce).to.equal(true);
      const mailArg = emailStub.sendMail.firstCall.args[0];
      expect(mailArg.to).to.equal('test@example.com');
      expect(mailArg.subject).to.equal('Activate your JumpInChat account');
      expect(signUpTemplateStub.calledOnce).to.equal(true);
      expect(signUpTemplateStub.firstCall.args[0]).to.deep.equal({
        username: 'testuser',
        token: 'generated-token',
      });
    });

    it('should call callback with no error on success', (done) => {
      verifyModelStub.create.resolves({ token: 'generated-token' });

      createEmailVerification(mockUser, (err) => {
        expect(err).to.not.exist;
        done();
      });
    });

    it('should call callback with error if findOneAndDelete fails', (done) => {
      const error = new Error('db error');
      verifyModelStub.findOneAndDelete.rejects(error);

      createEmailVerification(mockUser, (err) => {
        expect(err).to.equal(error);
        expect(verifyModelStub.create.called).to.equal(false);
        done();
      });
    });

    it('should call callback with error if create fails', (done) => {
      const error = new Error('create error');
      verifyModelStub.create.rejects(error);

      createEmailVerification(mockUser, (err) => {
        expect(err).to.equal(error);
        done();
      });
    });

    it('should use default no-op callback if none provided', async () => {
      verifyModelStub.create.resolves({ token: 'abc' });
      // Should not throw
      await createEmailVerification(mockUser);
    });
  });

  describe('createPasswordReset', () => {
    const verifiedUser = {
      _id: 'user456',
      username: 'verifieduser',
      auth: {
        email: 'verified@example.com',
        email_is_verified: true,
      },
    };

    const unverifiedUser = {
      _id: 'user789',
      username: 'unverifieduser',
      auth: {
        email: 'unverified@example.com',
        email_is_verified: false,
      },
    };

    it('should call callback immediately if user email is not verified', (done) => {
      createPasswordReset(unverifiedUser, (err) => {
        expect(err).to.not.exist;
        expect(verifyModelStub.findOneAndDelete.called).to.equal(false);
        expect(verifyModelStub.create.called).to.equal(false);
        expect(emailStub.sendMail.called).to.equal(false);
        done();
      });
    });

    it('should delete any existing password reset entry for the user', async () => {
      verifyModelStub.create.resolves({ token: 'abc123' });

      await createPasswordReset(verifiedUser, () => {});

      expect(verifyModelStub.findOneAndDelete.calledOnce).to.equal(true);
      expect(verifyModelStub.findOneAndDelete.firstCall.args[0]).to.deep.equal({
        userId: 'user456',
        type: 'passwordreset',
      });
    });

    it('should create a verification entry with passwordreset type', async () => {
      verifyModelStub.create.resolves({ token: 'reset-token' });

      await createPasswordReset(verifiedUser, () => {});

      expect(verifyModelStub.create.calledOnce).to.equal(true);
      const createArg = verifyModelStub.create.firstCall.args[0];
      expect(createArg.userId).to.equal('user456');
      expect(createArg.type).to.equal('passwordreset');
      expect(createArg.token).to.be.a('string');
      expect(createArg.token).to.have.lengthOf(64);
      expect(createArg.expireDate).to.be.an.instanceOf(Date);
    });

    it('should send email with password reset template', async () => {
      verifyModelStub.create.resolves({ token: 'reset-token' });

      await createPasswordReset(verifiedUser, () => {});

      expect(emailStub.sendMail.calledOnce).to.equal(true);
      const mailArg = emailStub.sendMail.firstCall.args[0];
      expect(mailArg.to).to.equal('verified@example.com');
      expect(mailArg.subject).to.equal('Password reset');
      expect(resetPasswordTemplateStub.calledOnce).to.equal(true);
      expect(resetPasswordTemplateStub.firstCall.args[0]).to.deep.equal({
        username: 'verifieduser',
        token: 'reset-token',
      });
    });

    it('should call callback with no error on success', (done) => {
      verifyModelStub.create.resolves({ token: 'reset-token' });

      createPasswordReset(verifiedUser, (err) => {
        expect(err).to.not.exist;
        done();
      });
    });

    it('should call callback with error if findOneAndDelete fails', (done) => {
      const error = new Error('delete error');
      verifyModelStub.findOneAndDelete.rejects(error);

      createPasswordReset(verifiedUser, (err) => {
        expect(err).to.equal(error);
        expect(verifyModelStub.create.called).to.equal(false);
        done();
      });
    });

    it('should call callback with error if create fails', (done) => {
      const error = new Error('create error');
      verifyModelStub.create.rejects(error);

      createPasswordReset(verifiedUser, (err) => {
        expect(err).to.equal(error);
        done();
      });
    });

    it('should use default no-op callback if none provided', async () => {
      verifyModelStub.create.resolves({ token: 'abc' });
      // Should not throw
      await createPasswordReset(verifiedUser);
    });
  });
});
