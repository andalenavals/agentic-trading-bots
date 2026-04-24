Deployment
==========

GitHub Pages
------------

The repository deploys two static pages from one GitHub Actions workflow:

* demo: ``https://andalenavals.github.io/agentic-trading-bots/``
* docs: ``https://andalenavals.github.io/agentic-trading-bots/docs/``

Workflow steps
--------------

The deployment workflow:

1. installs Node dependencies with ``npm ci``
2. installs Sphinx dependencies
3. runs ``npm run typecheck``
4. runs ``npm run lint``
5. runs ``npm run test:py``
6. runs ``npm run build`` with ``GITHUB_PAGES=true`` and the Pages preprocessing config
7. builds Sphinx docs into ``out/docs``
8. uploads ``out`` as the Pages artifact
9. deploys with ``actions/deploy-pages``

Local verification
------------------

Static app build:

.. code-block:: bash

   GITHUB_PAGES=true npm run build

Docs build:

.. code-block:: bash

   npm run docs:install
   npm run docs:build

Full local check:

.. code-block:: bash

   npm test
