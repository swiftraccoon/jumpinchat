export default async function terms(req, res) {
  const { locals } = res;

  // locals.section is used to set the currently selected
  // item in the header navigation.
  locals.section = 'Terms and Conditions';
  locals.user = req.user;

  // Render the view
  return res.render('terms');
}
