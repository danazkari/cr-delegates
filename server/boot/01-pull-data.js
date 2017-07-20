'use strict';

const jsdom = require('jsdom');
const {JSDOM} = jsdom;

const {
  DELEGATES_LIST_URL,
  FRACTIONS_LIST_URL,
} = process.env;

module.exports = function pullData(app) {
  const {
    Fraction,
    Province,
    Delegate,
  } = app.models;

  const getImage = element => {
    const image = element.querySelector('img');
    if (!image) {
      return;
    }
    return image.src;
  };

  const getAnchor = element => {
    const anchor = element.querySelector('a');
    if (!anchor) {
      return;
    }
    return anchor.innerHTML;
  };

  JSDOM.fromURL(FRACTIONS_LIST_URL)
    // Get the fractions out of the page
    .then(({window: {document}}) => {
      return Array
        .from(document.querySelectorAll('[summary="Fracciones "] tbody tr'))
        .map(fractionRow => {
          const [
            pictureColumn,
            nameColumn,
            descriptionColumn,
          ] = Array.from(fractionRow.querySelectorAll('td'));

          const getFractionInitials = fraction => `P${
            fraction
              .split(' ')
              .map(([letter]) => letter)
              .join('')
              .toUpperCase()
          }`;

          return {
            initials: getFractionInitials(getAnchor(nameColumn)),
            name: getAnchor(nameColumn),
            description: descriptionColumn.querySelector('p').innerHTML,
            picture: getImage(pictureColumn),
          };
        });
    })
    // Save each fraction in the database
    .then(fractions => new Promise((resolve, reject) => {
      Fraction.create(
        fractions,
        (error) => {
          if (error) {
            return reject(error);
          }
          return resolve(fractions);
        }
      );
    }))
    // Fetch the list of delegates
    .then(() => JSDOM.fromURL(DELEGATES_LIST_URL))
    // Query and process each delegate
    .then(({window: {document}}) => {
      return Array
        .from(
          document.querySelectorAll(
            '[summary="Diputadas y diputados "] tbody tr'
          )
        )
        .map(row => {
          const [
            pictureColumn,
            emailColumn,
            nameColumn,
            provinceColumn,
            fractionColumn,
            siteColumn,
          ] = Array.from(row.querySelectorAll('td'));

          return {
            picture: getImage(pictureColumn),
            email: getAnchor(emailColumn),
            name: getAnchor(nameColumn),
            province: provinceColumn.innerHTML.split('-')[1],
            fraction: getAnchor(fractionColumn),
            site: getAnchor(siteColumn),
          };
        });
    })
    // Create each delegate.
    .then(delegates => {
      delegates.forEach(delegate => {
        let fractionInitials;
        if (delegate.fraction.indexOf('(') !== -1) {
          fractionInitials = delegate.fraction
            .match(/\((\w*)\)/g)[0]
            .replace(/(\(|\))/g, '');
        }

        Fraction.find({where: {initials: fractionInitials}})
          .then(([fraction]) => new Promise((resolve, reject) => {
            fraction.delegates.create(delegate, (error, delegate) => {
              if (error) {
                return reject(error);
              }
              return resolve(delegate);
            });
          }));
      });
      console.log('done!');
    });
};
