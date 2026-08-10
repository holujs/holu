const i18n = require('./i18n');

/** @type {import('@docusaurus/types').DocusaurusConfig} */
module.exports = {
  i18n,
  title: 'Holu',
  url: 'https://holujs.github.io',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  markdown: { hooks: { onBrokenMarkdownLinks: 'throw' } },
  favicon: 'img/favicon.ico',
  organizationName: 'holujs', // Usually your GitHub org/user name.
  projectName: 'holujs.github.io', // Usually your repo name.
  trailingSlash: true,
  markdown: {
    mermaid: true,
  },
  themes: ['@docusaurus/theme-mermaid'],
  themeConfig: {
    navbar: {
      // title: 'Головна',
      logo: {
        alt: 'Holu Logo',
        src: 'img/logo.svg',
      },
      items: [
        // {
        //   type: 'doc',
        //   docId: 'intro',
        //   position: 'left',
        //   label: 'Документація Holu',
        // },
        {
          href: 'https://github.com/holujs/holu',
          position: 'right',
          className: 'header-github-link',
          'aria-label': 'GitHub repository',
        },
        // {to: '/blog', label: 'Blog', position: 'left'},
        // {
        //   type: 'docsVersionDropdown',
        // },
        {
          type: 'localeDropdown',
          position: 'right',
        },
      ],
    },
    algolia: {
      appId: 'KXSV6YPHSY',
      apiKey: '78706897b68fdb7b924b694fbd705ea4',
      indexName: 'Holu',

      // optional: see doc section below
      contextualSearch: true,

      // optional: see doc section below
      // appId: 'YOUR_APP_ID',

      // optional: Algolia search parameters
      // searchParameters: { facetFilters: ["type:content", "language:LANGUAGE"] },

      //... other Algolia params
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Community',
          items: [
            {
              label: 'Stack Overflow',
              href: 'https://stackoverflow.com/questions/tagged/holu',
            },
            {
              label: 'Twitter',
              href: 'https://twitter.com/holu',
            },
          ],
        },
        {
          title: 'More',
          items: [
            // {
            //   label: 'Blog',
            //   to: '/blog',
            // },
            {
              label: 'GitHub',
              href: 'https://github.com/holujs/holu',
            },
          ],
        },
      ],
      copyright: `Built with Docusaurus.`,
    },
  },
  presets: [
    [
      '@docusaurus/preset-classic',
      {
        gtag: {
          trackingID: 'G-JB9Z2HZH02',
          // optional fields.
          // anonymizeIP: true, // Should IPs be anonymized?
        },
        docs: {
          routeBasePath: '/',
          sidebarPath: require.resolve('./sidebars.js'),
          editUrl: ({ version, versionDocsDirPath, docPath, locale }) =>
            locale == 'en'
              ? `https://github.com/holujs/holu/edit/develop/website/i18n/en/docusaurus-plugin-content-docs/${version}/${docPath}`
              : `https://github.com/holujs/holu/edit/develop/website/${versionDocsDirPath}/${docPath}`,
        },
        // blog: {
        //   showReadingTime: true,
        //   editUrl:
        //     'https://github.com/holujs/holu/edit/main/website/blog/',
        // },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      },
    ],
  ],
  plugins: [
    [
      '@docusaurus/plugin-client-redirects',
      {
        // fromExtensions: ['html', 'htm'], // /myPage.html -> /myPage
        // toExtensions: ['exe', 'zip'], // /myAsset -> /myAsset.zip (if latter exists)
        // redirects: [
        //   // Redirect from multiple old paths to the new path
        //   {
        //     to: '/docs/newDoc2',
        //     from: ['/docs/oldDocFrom2019', '/docs/legacyDocFrom2016'],
        //   },
        // ],
        createRedirects(currentPath) {
          const arr = [
            ...getRedirect(currentPath, '/basic-components/error', ['/basic-components/http-error-handler']),
          ];
          return arr.length ? arr : undefined; // Return a falsy value: no redirect created
        },
      },
    ],
  ],
};

function getRedirect(currentPath, newPath, oldPaths) {
  const arr = [];
  if (currentPath.includes(newPath)) {
    oldPaths.forEach((oldPath) => {
      arr.push(currentPath.replace(newPath, oldPath));
    });
  }
  return arr;
}
