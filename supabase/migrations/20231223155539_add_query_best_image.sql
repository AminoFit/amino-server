

CREATE OR REPLACE FUNCTION public.get_best_food_image (query_embedding public.vector(768), match_threshold float, match_count int)
	RETURNS TABLE (
		id bigint, content text, similarity float, url text)
	LANGUAGE sql
	STABLE
	AS $$
	SELECT
		fi.id,
		fi. "imageDescription" AS image_description,
		1 - (fi."bgeBaseEmbedding" <=> query_embedding) AS similarity,
    fi."pathToImage" AS url
	FROM
		"FoodImage" fi
	WHERE
		1 - (fi."bgeBaseEmbedding" <=> query_embedding) > match_threshold
	ORDER BY
		(fi. "bgeBaseEmbedding" <=> query_embedding) ASC
	LIMIT match_count;
$$;

create index "FoodImage_bgeBaseEmbedding_idx" on public."FoodImage" using hnsw ("bgeBaseEmbedding" vector_cosine_ops);
