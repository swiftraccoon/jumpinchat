export default async function ageVerificationSuccess(req, res) {
  const { locals } = res;
  locals.section = 'Verification submission success';
  locals.user = req.user;

  return res.render('ageVerificationSuccess');
}
