#!/usr/bin/env node

const request         = require("request-promise");
const opener          = require("opener");
const Promise         = require("bluebird");
const cheerio         = require("cheerio");
const {uniq, compact} = require("lodash");

const SFSPCA_BASE = "https://www.sfspca.org"
const ADOPTION_PAGE = `${SFSPCA_BASE}/adoptions/dogs`;

const fetchDogsHelper = Promise.method((pageNumber, dogsSoFar) => {
  const url = pageNumber === 0 ? ADOPTION_PAGE : `${ADOPTION_PAGE}?page=${pageNumber}`
  return request.get(url)
    .then((adoptionsPage) => {
      const dogs = cheerio(adoptionsPage)
        .find("a")
        .filter((i, tag) => tag.attribs.href && tag.attribs.href.match(/adoptions\/pet-details\/\d+/))
        .map((i, tag) => `${SFSPCA_BASE}${tag.attribs.href}`)
        .toArray();
      if (!dogs || dogs.length === 0) {
        return dogsSoFar;
      } else {
        return fetchDogsHelper(pageNumber + 1, dogsSoFar.concat(dogs));
      }
    })
    .catch((err) => {
      console.log("Error fetching dogs:", err);
      return dogsSoFar;
    });
});
const fetchDogs = () => fetchDogsHelper(0, []);

console.log("Accessing San Francisco SPCA (Dog Department)...");

fetchDogs()
  .then(uniq) // NO DOG DUPLICATES
  .tap((dogs) => console.log(`Dog information system accessed. ${dogs.length} dogs found. Beginning weighing process...`))
  .map((url) => {
    return request.get(url)
      // SPCA sometimes returns 403s for some dogs, ignore this.
      .catch((err) => err)
      .then((dogPage) => {
        const $ = cheerio.load(dogPage);
        const name = $(".field-name-title h1").text();
        const weight = $(".field-name-field-animal-weight .field-item").text();
        const lbs = Number(/(\d+)lbs\./.exec(weight)[1]);
        const oz = /(\d+)oz\./.test(weight) ? Number(/(\d+)oz\./.exec(weight)[1]) : 0;
        const ozWeight = lbs * 16 + oz;
        const isFemale = $(".field-name-field-gender .field-item").text().trim() === "Female";

        console.log("Weighing dog:", name, `– ${lbs} lbs ${oz} oz`);

        return {name, lbs, oz, isFemale, url, ozWeight}
      })
      // Null for dogs that cannot be parsed.
      .catch(() => {});
  })
  // Filter out unparsable dogs.
  .then(compact)
  .then((dogs) => {
    const scrawniestDog = dogs.reduce((currentScrawniest, dog) => {
      return (dog.ozWeight < currentScrawniest.ozWeight) ? dog : currentScrawniest;
    }, dogs[0]);
    console.log(`The scrawniest dog is ${scrawniestDog.name}. ${(scrawniestDog.isFemale ? "She" : "He")} weighs ${scrawniestDog.lbs} lbs and ${scrawniestDog.oz} oz.`);
    setTimeout(() => console.log("Opening dog profile..."), 2000);
    setTimeout(() => opener(scrawniestDog.url), 4000);
  });
