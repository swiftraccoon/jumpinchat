export default async function siteModConduct(req, res) {
  const { locals } = res;
  locals.section = 'Site Mod | Code of Conduct';
  locals.page = 'conduct';

  return res.render('sitemod/conduct');
}
