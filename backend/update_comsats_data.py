from comsats_scraper import refresh_comsats_knowledge


if __name__ == "__main__":
    data = refresh_comsats_knowledge()
    print(
        f"Updated COMSATS knowledge: "
        f"{data.get('page_count', 0)} pages, "
        f"{data.get('chunk_count', 0)} chunks"
    )
    if data.get("errors"):
        print("Some pages could not be scraped:")
        for err in data["errors"]:
            print(f"- {err['url']}: {err['error']}")
